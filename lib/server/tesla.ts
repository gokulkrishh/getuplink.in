import "server-only";
import { cache } from "react";
import { DEMO } from "@/lib/demo";
import { decrypt, encrypt } from "./crypto";
import { demoData } from "./demo";
import { env, fleetApiBase, signupMode } from "./env";
import { eraseOwnerRows } from "./data/erase";
import { foldApiUsage, UNATTRIBUTED } from "./data/usage";
import { countRequest } from "./usage";
import { isBillable, kindOf } from "@/lib/tesla-billing";
import { type Owner, ownerDb } from "./data/owner";
import {
  APPROVED,
  carsOthersTrack,
  DECLINED,
  deleteUser,
  joinWaitlist,
  ownerOf,
  revokeUserSessions,
  SUSPENDED,
  userById,
  userBySub,
  WAITLIST,
} from "./data/system";

export const AUTHORIZE_URL = "https://auth.tesla.com/oauth2/v3/authorize";
export const TOKEN_URL = "https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token";
// A token from before a scope was added lacks it until the next sign-in.
// The owner keeps everything Tesla shares, so sign-in asks for every read scope enabled in the developer
// app: profile, vehicle data, location and charging. Commands and energy products stay off.
export const LOCATION_SCOPE = "vehicle_location";
export const SCOPES = ["openid", "offline_access", "user_data", "vehicle_device_data", LOCATION_SCOPE, "vehicle_charging_cmds"].join(" ");

// Refresh a little early so a token never expires mid-poll.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
  id_token?: string;
};

export class TeslaError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export class NotConnectedError extends Error {
  constructor() {
    super("Tesla account is not connected");
  }
}

// Every request Uplink sends the Fleet API goes through here, so each is counted (lib/server/usage.ts) under
// its user, or UNATTRIBUTED before there is one. Tesla bills every answer below 500, so that's what counts,
// once per attempt: a 401 and its retry are two. No answer (a network error) isn't billed or counted.
async function teslaFetch(userId: number, path: string, init: { method?: string; token: string; json?: unknown }): Promise<Response> {
  const method = init.method ?? "GET";
  const headers: Record<string, string> = { Authorization: `Bearer ${init.token}` };
  if (init.json !== undefined) headers["Content-Type"] = "application/json";
  const body = init.json === undefined ? undefined : JSON.stringify(init.json);
  const res = await fetch(`${fleetApiBase()}${path}`, { method, headers, body, cache: "no-store" });
  if (isBillable(res.status)) await countRequest(userId, kindOf(method, path));
  return res;
}

export function authorizeUrl(state: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: env("TESLA_CLIENT_ID"),
    redirect_uri: env("TESLA_REDIRECT_URI"),
    scope: SCOPES,
    state,
    prompt_missing_scopes: "true",
  }).toString();
  return url.toString();
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  if (DEMO) throw new Error("Tesla is off in demo mode");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new TeslaError(`Token request failed (${res.status}): ${await res.text()}`, res.status);
  }
  // Never store half a token pair: a malformed answer must fail here, not as a broken row.
  const body = (await res.json().catch(() => null)) as Partial<TokenResponse> | null;
  if (
    !body ||
    typeof body.access_token !== "string" ||
    typeof body.refresh_token !== "string" ||
    typeof body.expires_in !== "number" ||
    !Number.isFinite(body.expires_in)
  ) {
    throw new TeslaError("Token response was missing a token or expiry", res.status);
  }
  return body as TokenResponse;
}

// The token came straight from Tesla's token endpoint over TLS, so reading the
// payload without verifying the signature is enough to learn who signed in.
function idTokenSubject(idToken: string | undefined): string {
  const payload = idToken?.split(".")[1];
  let sub: unknown;
  try {
    sub = payload ? (JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub?: unknown }).sub : undefined;
  } catch {
    // Falls through to the error below.
  }
  if (typeof sub !== "string" || !sub) throw new Error("Tesla did not return an id_token with a subject");
  return sub;
}

// The user to start a session for, or why there is none:
// - "not-owner": sign-up is closed and Uplink doesn't know this Tesla account;
// - "waitlist": on the waitlist (just joined, or still waiting);
// - "not-approved": declined or suspended;
// - "region": not an account the APAC Fleet API serves, so it can't join.
export type SignInResult = { userId: number; owner: Owner } | "not-owner" | "waitlist" | "not-approved" | "region";

// Whether Tesla serves this account from the Fleet API Uplink uses (TESLA_FLEET_API_BASE_URL, the
// North America and Asia-Pacific one): /api/1/users/region names the account's base URL. Tesla gives
// North America and Asia-Pacific the same one, so this refuses Europe, the Middle East, Africa and China,
// not North America. Throws when Tesla doesn't answer: a sign-up then fails rather than joining unchecked.
async function servedRegion(accessToken: string): Promise<boolean> {
  const res = await teslaFetch(UNATTRIBUTED, "/api/1/users/region", { token: accessToken });
  if (!res.ok) throw new TeslaError(`GET /api/1/users/region failed (${res.status})`, res.status);
  const body = (await res.json().catch(() => null)) as { response?: { fleet_api_base_url?: unknown } | null } | null;
  const base = body?.response?.fleet_api_base_url;
  if (typeof base !== "string" || !base) throw new TeslaError("Tesla's region answer had no base URL", res.status);
  return base.replace(/\/$/, "") === fleetApiBase();
}

// Sign in with Tesla doubles as the dashboard login. Only a Tesla account with an approved users row signs
// in, and only then are its Tesla tokens stored. Anyone else gets no session and no stored tokens: the
// pair Tesla just issued is used at most once, for the region check, and dropped.
// A Tesla account Uplink doesn't know joins the waitlist when SIGNUP_MODE is waitlist (or open, for now;
// see signupMode): a users row with its Tesla account id and the time, nothing else.
export async function signIn(code: string): Promise<SignInResult> {
  const tokens = await tokenRequest({
    grant_type: "authorization_code",
    client_id: env("TESLA_CLIENT_ID"),
    client_secret: env("TESLA_CLIENT_SECRET"),
    code,
    audience: fleetApiBase(),
    redirect_uri: env("TESLA_REDIRECT_URI"),
  });
  const sub = idTokenSubject(tokens.id_token);
  const user = await userBySub(sub);
  if (user?.status === WAITLIST) return "waitlist";
  if (user?.status === DECLINED || user?.status === SUSPENDED) return "not-approved";
  if (!user) {
    if (signupMode() === "closed") return "not-owner";
    if (!(await servedRegion(tokens.access_token))) return "region";
    await joinWaitlist(sub);
    return "waitlist";
  }
  if (user.status !== APPROVED) return "not-approved";
  const owner = ownerOf(user);
  // Replaces whatever pair was stored, disconnected or not: a sign-in always wins.
  const { error } = await ownerDb(owner)
    .from("user_tokens")
    .upsert(
      {
        access_token_enc: encrypt(tokens.access_token),
        refresh_token_enc: encrypt(tokens.refresh_token),
        expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        scope: tokens.scope ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  if (error) throw new Error(`Saving tokens failed: ${error.message}`);
  return { userId: owner.userId, owner };
}

// Refresh tokens are single use, and Tesla can revoke the whole chain (the pair just stored included)
// when a spent one is presented again. So only one refresh may reach Tesla at a time: requests in this
// instance share one per user (inflight), and across instances the first claims a short lease on the
// user's row while the others wait for the tokens it stores. The new pair is stored with a compare-and-swap
// on the refresh token we read, so a disconnect in the meantime is never overwritten.
const LEASE_MS = 30_000;
const WAIT_STEP_MS = 500;
const inflight = new Map<number, { refreshTokenEnc: string; promise: Promise<string> }>();

function refresh(owner: Owner, stored: StoredTokens): Promise<string> {
  const current = inflight.get(owner.userId);
  if (current && current.refreshTokenEnc === stored.refreshTokenEnc) return current.promise;
  const promise = refreshOnce(owner, stored).finally(() => {
    if (inflight.get(owner.userId)?.promise === promise) inflight.delete(owner.userId);
  });
  inflight.set(owner.userId, { refreshTokenEnc: stored.refreshTokenEnc, promise });
  return promise;
}

async function refreshOnce(owner: Owner, stored: StoredTokens): Promise<string> {
  const deadline = Date.now() + LEASE_MS;
  while (!(await claimLease(owner, stored))) {
    // Another instance is refreshing: wait for the tokens it stores rather than spend the same one.
    await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MS));
    const current = await readTokens(owner);
    if (!current) throw new NotConnectedError();
    if (current.refreshTokenEnc !== stored.refreshTokenEnc) return current.accessToken;
    if (Date.now() > deadline) throw new Error("Waited too long for another token refresh");
  }
  let tokens: TokenResponse;
  try {
    tokens = await tokenRequest({
      grant_type: "refresh_token",
      client_id: env("TESLA_CLIENT_ID"),
      refresh_token: stored.refreshToken,
    });
  } catch (err) {
    await releaseLease(owner, stored);
    // A disconnect or a sign-in may have replaced the tokens meanwhile; if so, use those.
    const current = await readTokens(owner);
    if (!current) throw new NotConnectedError();
    if (current.refreshTokenEnc !== stored.refreshTokenEnc) return current.accessToken;
    throw err;
  }
  const { data, error } = await ownerDb(owner)
    .from("user_tokens")
    .update({
      access_token_enc: encrypt(tokens.access_token),
      refresh_token_enc: encrypt(tokens.refresh_token),
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scope: tokens.scope ?? null,
      refreshing_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq("refresh_token_enc", stored.refreshTokenEnc)
    .select("user_id");
  if (error) throw new Error(`Saving tokens failed: ${error.message}`);
  if (data?.length === 1) return tokens.access_token;
  // Nothing matched: the owner disconnected (don't write tokens back) or signed in again meanwhile.
  const current = await readTokens(owner);
  if (!current) throw new NotConnectedError();
  return current.accessToken;
}

// Claims the refresh for this refresh token, unless another request holds an unexpired lease on it.
async function claimLease(owner: Owner, stored: StoredTokens): Promise<boolean> {
  const now = new Date();
  const { data, error } = await ownerDb(owner)
    .from("user_tokens")
    .update({ refreshing_until: new Date(now.getTime() + LEASE_MS).toISOString() })
    .eq("refresh_token_enc", stored.refreshTokenEnc)
    .or(`refreshing_until.is.null,refreshing_until.lt.${now.toISOString()}`)
    .select("user_id");
  if (error) throw new Error(`Claiming the token refresh failed: ${error.message}`);
  return data?.length === 1;
}

async function releaseLease(owner: Owner, stored: StoredTokens): Promise<void> {
  await ownerDb(owner).from("user_tokens").update({ refreshing_until: null }).eq("refresh_token_enc", stored.refreshTokenEnc);
}

const TOKEN_COLUMNS = "access_token_enc, refresh_token_enc, expires_at, scope, created_at, updated_at";

type TokenRow = {
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  expires_at: string | null;
  scope: string | null;
  created_at: string;
  updated_at: string;
};

// The owner's user_tokens row, or null when they have none. Null tokens in the row mean disconnected.
async function readTokenRow(owner: Owner): Promise<TokenRow | null> {
  const { data, error } = await ownerDb(owner).from("user_tokens").select(TOKEN_COLUMNS).maybeSingle();
  if (error) throw new Error(`Reading tokens failed: ${error.message}`);
  return data as TokenRow | null;
}

type StoredTokens = NonNullable<Awaited<ReturnType<typeof readTokens>>>;

// Null when the owner has no tokens or is disconnected. Always a fresh read: refreshing depends on it.
async function readTokens(owner: Owner) {
  const data = await readTokenRow(owner);
  if (!data?.access_token_enc || !data.refresh_token_enc || !data.expires_at) return null;
  return {
    accessToken: decrypt(data.access_token_enc),
    refreshToken: decrypt(data.refresh_token_enc),
    refreshTokenEnc: data.refresh_token_enc,
    expiresAt: new Date(data.expires_at).getTime(),
  };
}

async function storedTokens(owner: Owner): Promise<StoredTokens> {
  const tokens = await readTokens(owner);
  if (!tokens) throw new NotConnectedError();
  return tokens;
}

// Each user's token row, read once per request however many of the functions below ask for it. Never
// used for refreshing (readTokens above): that needs a fresh read.
const requestTokenRows = cache(() => new Map<number, Promise<TokenRow | null>>());

function tokenRow(owner: Owner): Promise<TokenRow | null> {
  const rows = requestTokenRows();
  let row = rows.get(owner.userId);
  if (!row) rows.set(owner.userId, (row = readTokenRow(owner)));
  return row;
}

// The users row a session names, read once per request (lib/server/auth.ts currentOwner).
export const sessionUser = cache(userById);

export async function isConnected(owner: Owner): Promise<boolean> {
  if (DEMO) return true;
  return Boolean((await tokenRow(owner))?.access_token_enc);
}

// When the tokens were last saved (a sign-in or a refresh), or null when not connected.
export async function tokensSavedAt(owner: Owner): Promise<string | null> {
  if (DEMO) return null;
  const data = await tokenRow(owner);
  return data?.access_token_enc ? data.updated_at : null;
}

export type AccountInfo = { connected: boolean; connectedSince: string | null };

// Connected since the account's first sign-in (users.created_at).
export async function accountInfo(owner: Owner): Promise<AccountInfo> {
  if (DEMO) return { connected: true, connectedSince: demoData().history.at(-1)?.detected_at ?? null };
  const [data, user] = await Promise.all([tokenRow(owner), sessionUser(owner.userId)]);
  return { connected: Boolean(data?.access_token_enc), connectedSince: user?.created_at ?? data?.created_at ?? null };
}

// Whether the stored token was granted a scope. Tesla's token answer lists them in `scope`, saved at
// sign-in and each refresh; when that's missing, the access token's own `scp` claim says. Unknown is no.
export async function hasScope(owner: Owner, scope: string): Promise<boolean> {
  if (DEMO) return true;
  const data = await tokenRow(owner);
  if (typeof data?.scope === "string" && data.scope) return data.scope.split(" ").includes(scope);
  if (!data?.access_token_enc) return false;
  try {
    const payload = decrypt(data.access_token_enc).split(".")[1];
    const scp = (JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { scp?: unknown }).scp;
    return Array.isArray(scp) ? scp.includes(scope) : typeof scp === "string" && scp.split(" ").includes(scope);
  } catch {
    return false;
  }
}

// "Sign out everywhere": the owner's sessions issued before now stop working (see currentOwner).
export async function revokeAllSessions(owner: Owner): Promise<void> {
  if (DEMO) return;
  await revokeUserSessions(owner, new Date().toISOString()).catch((err: Error) => {
    throw new Error(`Signing out everywhere failed: ${err.message}`);
  });
}

// Tell Tesla to stop the car streaming to Uplink, for each of the owner's cars that no other user tracks.
// Tesla keeps one streaming config per car for the app, so stopping a shared car's would stop it for the
// other user too; theirs keeps streaming, and they keep reading it. Best effort: a failure is logged and
// never blocks disconnecting or deleting (a car left streaming with nobody tracking it has its readings
// deleted by the daily retention run). Must run before the tokens go.
async function stopStreaming(owner: Owner): Promise<void> {
  try {
    const { data, error } = await ownerDb(owner).from("vehicles").select("vin").not("vin", "is", null);
    if (error) throw new Error(error.message);
    const vins = (data ?? []).map((r) => r.vin as string);
    const shared = await carsOthersTrack(owner, vins);
    const own = vins.filter((vin) => !shared.has(vin));
    if (own.length === 0) return;
    const token = await accessToken(owner);
    await Promise.all(
      own.map(async (vin) => {
        try {
          const res = await teslaFetch(owner.userId, `/api/1/vehicles/${vin}/fleet_telemetry_config`, { method: "DELETE", token });
          if (!res.ok) console.warn(`Stopping streaming failed (${res.status}):`, await res.text());
        } catch (err) {
          console.warn("Stopping streaming failed:", err instanceof Error ? err.message : err);
        }
      }),
    );
  } catch (err) {
    console.warn("Stopping streaming failed:", err instanceof Error ? err.message : err);
  }
}

// Forget the owner's Tesla tokens and sign them out everywhere. The user_tokens row stays with no tokens
// in it, which is what "disconnected" means; the users row stays, so the same Tesla account can sign in
// again.
export async function disconnectTesla(owner: Owner): Promise<void> {
  if (DEMO) return;
  await stopStreaming(owner);
  const now = new Date().toISOString();
  const { error } = await ownerDb(owner)
    .from("user_tokens")
    .upsert({ access_token_enc: null, refresh_token_enc: null, expires_at: null, refreshing_until: null, updated_at: now }, { onConflict: "user_id" });
  if (error) throw new Error(`Disconnecting failed: ${error.message}`);
  await revokeUserSessions(owner, now).catch((err: Error) => {
    throw new Error(`Disconnecting failed: ${err.message}`);
  });
}

async function accessToken(owner: Owner, forceRefresh = false): Promise<string> {
  if (DEMO) throw new Error("Tesla is off in demo mode");
  const tokens = await storedTokens(owner);
  if (forceRefresh || tokens.expiresAt - Date.now() < REFRESH_MARGIN_MS) {
    return refresh(owner, tokens);
  }
  return tokens.accessToken;
}

// A request to the Fleet API with the owner's token (a GET, or a POST with a JSON body); retries once
// after a 401. Returns the raw Response, so the caller must check `ok`.
async function fleetFetch(owner: Owner, path: string, post?: { json: unknown }): Promise<Response> {
  let token = await accessToken(owner);
  for (let attempt = 0; ; attempt++) {
    const res = await teslaFetch(owner.userId, path, post ? { token, method: "POST", json: post.json } : { token });
    if (res.status === 401 && attempt === 0) {
      token = await accessToken(owner, true);
      continue;
    }
    return res;
  }
}

// Tesla can answer 200 with `response: null`; callers decide what that means.
export async function fleetGet<T>(owner: Owner, path: string): Promise<T | null> {
  const res = await fleetFetch(owner, path);
  if (!res.ok) {
    throw new TeslaError(`GET ${path} failed (${res.status}): ${await res.text()}`, res.status);
  }
  const body = (await res.json()) as { response?: T | null } | null;
  return body?.response ?? null;
}

// A POST with a JSON body, answered with JSON: the whole body, since some answers say more than `response`.
export async function fleetPost(owner: Owner, path: string, json: unknown): Promise<unknown> {
  const res = await fleetFetch(owner, path, { json });
  if (!res.ok) {
    throw new TeslaError(`POST ${path} failed (${res.status}): ${await res.text()}`, res.status);
  }
  return res.json();
}

// The same GET as fleetGet, but the whole body.
export async function fleetGetBody(owner: Owner, path: string): Promise<unknown> {
  const res = await fleetFetch(owner, path);
  if (!res.ok) {
    throw new TeslaError(`GET ${path} failed (${res.status}): ${await res.text()}`, res.status);
  }
  return res.json();
}

// For binary responses such as invoice PDFs: the body is not JSON, so the caller reads it.
export function fleetGetRaw(owner: Owner, path: string): Promise<Response> {
  return fleetFetch(owner, path);
}

// "Delete my data": remove the owner's cars and everything recorded from them (see eraseOwnerRows),
// the Tesla tokens, and sign out everywhere. The users row stays, so the account can sign in again.
// Every delete goes by the owner's own user_id, never "every row", so another account's data can't go
// with it. Release notes and place names are shared, not the owner's.
export async function deleteMyData(owner: Owner): Promise<void> {
  if (DEMO) return;
  // Before the vehicles go: it needs their VINs. disconnectTesla below repeats it harmlessly.
  await stopStreaming(owner);
  await eraseOwnerRows(owner);
  await disconnectTesla(owner);
}

// "Delete account": Delete my data, then the users row itself, which cascades to every per-user table
// left (user_tokens, and anything written since). Invoice files and readings are already gone:
// eraseOwnerRows deletes the files (storage has no cascade) and the readings nobody else may see (they are
// stored per car, not per user, so a shared car's stay for its other user). With sign-up closed, the
// account can't sign in again unless it is approved anew.
export async function deleteAccount(owner: Owner): Promise<void> {
  if (DEMO) return;
  await deleteMyData(owner);
  // Its Tesla API counts stay in the developer account's month, as unattributed. Best effort.
  await foldApiUsage(owner).catch((err: Error) => console.warn("Keeping the Tesla API counts failed:", err.message));
  await deleteUser(owner).catch((err: Error) => {
    throw new Error(`Deleting the account failed: ${err.message}`);
  });
}
