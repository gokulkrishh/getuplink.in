import "server-only";
import { cache } from "react";
import { DEMO } from "@/lib/demo";
import { decrypt, encrypt } from "./crypto";
import { demoData } from "./demo";
import { env, fleetApiBase } from "./env";
import { eraseOwnerRows } from "./data/erase";
import { type Owner, ownerDb } from "./data/owner";
import { claimAccount, legacyAccount } from "./data/system";

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

export type SignInResult = "claimed" | "owner" | "not-owner";

// Sign in with Tesla doubles as the dashboard login: the first account to sign in
// becomes the owner, and only that account can sign in afterwards.
export async function signIn(code: string): Promise<SignInResult> {
  const tokens = await tokenRequest({
    grant_type: "authorization_code",
    client_id: env("TESLA_CLIENT_ID"),
    client_secret: env("TESLA_CLIENT_SECRET"),
    code,
    audience: fleetApiBase(),
    redirect_uri: env("TESLA_REDIRECT_URI"),
  });
  return claimAccount(idTokenSubject(tokens.id_token), {
    access_token_enc: encrypt(tokens.access_token),
    refresh_token_enc: encrypt(tokens.refresh_token),
    expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    scope: tokens.scope ?? null,
    updated_at: new Date().toISOString(),
  });
}

// Refresh tokens are single use, and Tesla can revoke the whole chain (the pair just stored included)
// when a spent one is presented again. So only one refresh may reach Tesla at a time: requests in this
// instance share one (inflight), and across instances the first claims a short lease on the row while the
// others wait for the tokens it stores. The new pair is stored with a compare-and-swap on the refresh
// token we read, so a disconnect in the meantime is never overwritten.
const LEASE_MS = 30_000;
const WAIT_STEP_MS = 500;
let inflight: { refreshTokenEnc: string; promise: Promise<string> } | null = null;

function refresh(owner: Owner, stored: StoredTokens): Promise<string> {
  const current = inflight;
  if (current && current.refreshTokenEnc === stored.refreshTokenEnc) return current.promise;
  const promise = refreshOnce(owner, stored).finally(() => {
    if (inflight?.promise === promise) inflight = null;
  });
  inflight = { refreshTokenEnc: stored.refreshTokenEnc, promise };
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
    .from("oauth_tokens")
    .update({
      access_token_enc: encrypt(tokens.access_token),
      refresh_token_enc: encrypt(tokens.refresh_token),
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scope: tokens.scope ?? null,
      refreshing_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq("refresh_token_enc", stored.refreshTokenEnc)
    .select("provider");
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
    .from("oauth_tokens")
    .update({ refreshing_until: new Date(now.getTime() + LEASE_MS).toISOString() })
    .eq("refresh_token_enc", stored.refreshTokenEnc)
    .or(`refreshing_until.is.null,refreshing_until.lt.${now.toISOString()}`)
    .select("provider");
  if (error) throw new Error(`Claiming the token refresh failed: ${error.message}`);
  return data?.length === 1;
}

async function releaseLease(owner: Owner, stored: StoredTokens): Promise<void> {
  await ownerDb(owner).from("oauth_tokens").update({ refreshing_until: null }).eq("refresh_token_enc", stored.refreshTokenEnc);
}

type StoredTokens = NonNullable<Awaited<ReturnType<typeof readTokens>>>;

// Null when the owner row is missing or disconnected.
async function readTokens(owner: Owner) {
  const { data, error } = await ownerDb(owner).from("oauth_tokens").select("access_token_enc, refresh_token_enc, expires_at").maybeSingle();
  if (error) throw new Error(`Reading tokens failed: ${error.message}`);
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

// The account row (see legacyAccount), read once per request however many of the functions below and
// currentOwner ask for it. Never used for refreshing (readTokens above): that needs a fresh read.
export const accountRow = cache(legacyAccount);

// The owner's own account row, or null when it isn't theirs.
async function ownRow(owner: Owner) {
  const data = await accountRow();
  return data?.owner_sub === owner.sub ? data : null;
}

export async function isConnected(owner: Owner): Promise<boolean> {
  if (DEMO) return true;
  return Boolean((await ownRow(owner))?.access_token_enc);
}

// When the tokens were last saved (a sign-in or a refresh), or null when not connected.
export async function tokensSavedAt(owner: Owner): Promise<string | null> {
  if (DEMO) return null;
  const data = await ownRow(owner);
  return data?.access_token_enc ? data.updated_at : null;
}

export type AccountInfo = { connected: boolean; connectedSince: string | null };

export async function accountInfo(owner: Owner): Promise<AccountInfo> {
  if (DEMO) return { connected: true, connectedSince: demoData().history.at(-1)?.detected_at ?? null };
  const data = await ownRow(owner);
  return { connected: Boolean(data?.access_token_enc), connectedSince: data?.created_at ?? null };
}

// Whether the stored token was granted a scope. Tesla's token answer lists them in `scope`, saved at
// sign-in and each refresh; when that's missing, the access token's own `scp` claim says. Unknown is no.
export async function hasScope(owner: Owner, scope: string): Promise<boolean> {
  if (DEMO) return true;
  const { data, error } = await ownerDb(owner).from("oauth_tokens").select("scope, access_token_enc").maybeSingle();
  if (error) throw new Error(`Reading account failed: ${error.message}`);
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
  const { error } = await ownerDb(owner).from("oauth_tokens").update({ sessions_valid_after: new Date().toISOString() });
  if (error) throw new Error(`Signing out everywhere failed: ${error.message}`);
}

// Tell Tesla to stop the car streaming to Uplink, for each of the owner's cars. Best effort: a
// failure is logged and never blocks disconnecting or deleting. Must run before the tokens go.
async function stopStreaming(owner: Owner): Promise<void> {
  try {
    const { data, error } = await ownerDb(owner).from("vehicles").select("vin").not("vin", "is", null);
    if (error) throw new Error(error.message);
    const token = await accessToken(owner);
    await Promise.all(
      (data ?? []).map(async ({ vin }) => {
        try {
          const res = await fetch(`${fleetApiBase()}/api/1/vehicles/${vin}/fleet_telemetry_config`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          });
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

// Forget the owner's Tesla tokens but keep owner_sub, so only the same Tesla account can sign in again.
export async function disconnectTesla(owner: Owner): Promise<void> {
  if (DEMO) return;
  await stopStreaming(owner);
  const { error } = await ownerDb(owner).from("oauth_tokens").update({
    access_token_enc: null,
    refresh_token_enc: null,
    expires_at: null,
    sessions_valid_after: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Disconnecting failed: ${error.message}`);
}

async function accessToken(owner: Owner, forceRefresh = false): Promise<string> {
  if (DEMO) throw new Error("Tesla is off in demo mode");
  const tokens = await storedTokens(owner);
  if (forceRefresh || tokens.expiresAt - Date.now() < REFRESH_MARGIN_MS) {
    return refresh(owner, tokens);
  }
  return tokens.accessToken;
}

// GET against the Fleet API with the owner's token; retries once after a 401. Returns the raw
// Response, so the caller must check `ok`.
async function fleetFetch(owner: Owner, path: string): Promise<Response> {
  let token = await accessToken(owner);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${fleetApiBase()}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
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

// For binary responses such as invoice PDFs: the body is not JSON, so the caller reads it.
export function fleetGetRaw(owner: Owner, path: string): Promise<Response> {
  return fleetFetch(owner, path);
}

// "Delete my data": remove the owner's cars and everything recorded from them (see eraseOwnerRows),
// the Tesla tokens, and sign out everywhere. owner_sub stays, so the dashboard can't be claimed by
// another Tesla account. Every delete goes by the owner's own keys, never "every row", so another
// account's data can't go with it. Release notes and place names are shared, not the owner's.
export async function deleteMyData(owner: Owner): Promise<void> {
  if (DEMO) return;
  // Before the vehicles go: it needs their VINs. disconnectTesla below repeats it harmlessly.
  await stopStreaming(owner);
  await eraseOwnerRows(owner);
  await disconnectTesla(owner);
}
