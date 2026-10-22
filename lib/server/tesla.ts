import "server-only";
import { cache } from "react";
import { DEMO } from "@/lib/demo";
import { decrypt, encrypt } from "./crypto";
import { demoData } from "./demo";
import { env, fleetApiBase } from "./env";
import { db } from "./supabase";

export const AUTHORIZE_URL = "https://auth.tesla.com/oauth2/v3/authorize";
export const TOKEN_URL = "https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token";
// vehicle_charging_cmds is for Supercharger history; it must be enabled in the Tesla developer app.
export const SCOPES = ["openid", "offline_access", "vehicle_device_data", "vehicle_charging_cmds"].join(" ");

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
  const sub = idTokenSubject(tokens.id_token);
  // Make sure the row exists without touching an existing one, then claim it with a single
  // conditional update: of two first sign-ins racing, only one can match "no owner or me".
  const { error: insertError } = await db()
    .from("oauth_tokens")
    .upsert({ provider: "tesla" }, { onConflict: "provider", ignoreDuplicates: true });
  if (insertError) throw new Error(`Saving tokens failed: ${insertError.message}`);
  const { data: before, error: readError } = await db()
    .from("oauth_tokens")
    .select("owner_sub")
    .eq("provider", "tesla")
    .maybeSingle();
  if (readError) throw new Error(`Reading owner failed: ${readError.message}`);
  const quoted = `"${sub.replace(/[\\"]/g, "\\$&")}"`;
  const { data: updated, error } = await db()
    .from("oauth_tokens")
    .update({
      owner_sub: sub,
      access_token_enc: encrypt(tokens.access_token),
      refresh_token_enc: encrypt(tokens.refresh_token),
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scope: tokens.scope ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("provider", "tesla")
    .or(`owner_sub.is.null,owner_sub.eq.${quoted}`)
    .select("provider");
  if (error) throw new Error(`Saving tokens failed: ${error.message}`);
  if (!updated?.length) return "not-owner";
  return before?.owner_sub ? "owner" : "claimed";
}

// Refresh tokens are single use, so the new pair is stored with a compare-and-swap on the refresh
// token we read. A disconnect or a concurrent refresh changes that column, so we never write
// tokens back after a disconnect, and a losing request reuses the winner's tokens.
async function refresh(stored: StoredTokens): Promise<string> {
  let tokens: TokenResponse;
  try {
    tokens = await tokenRequest({
      grant_type: "refresh_token",
      client_id: env("TESLA_CLIENT_ID"),
      refresh_token: stored.refreshToken,
    });
  } catch (err) {
    // Another request may have used the single-use token first; if so its tokens are already stored.
    const current = await readTokens();
    if (!current) throw new NotConnectedError();
    if (current.refreshTokenEnc !== stored.refreshTokenEnc) return current.accessToken;
    throw err;
  }
  const { data, error } = await db()
    .from("oauth_tokens")
    .update({
      access_token_enc: encrypt(tokens.access_token),
      refresh_token_enc: encrypt(tokens.refresh_token),
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scope: tokens.scope ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("provider", "tesla")
    .eq("refresh_token_enc", stored.refreshTokenEnc)
    .select("provider");
  if (error) throw new Error(`Saving tokens failed: ${error.message}`);
  if (data?.length === 1) return tokens.access_token;
  // Nothing matched: the owner disconnected (don't write tokens back) or another request stored newer ones.
  const current = await readTokens();
  if (!current) throw new NotConnectedError();
  return current.accessToken;
}

type StoredTokens = NonNullable<Awaited<ReturnType<typeof readTokens>>>;

// Null when the owner row is missing or disconnected.
async function readTokens() {
  const { data, error } = await db()
    .from("oauth_tokens")
    .select("access_token_enc, refresh_token_enc, expires_at")
    .eq("provider", "tesla")
    .maybeSingle();
  if (error) throw new Error(`Reading tokens failed: ${error.message}`);
  if (!data?.access_token_enc || !data.refresh_token_enc || !data.expires_at) return null;
  return {
    accessToken: decrypt(data.access_token_enc),
    refreshToken: decrypt(data.refresh_token_enc),
    refreshTokenEnc: data.refresh_token_enc,
    expiresAt: new Date(data.expires_at).getTime(),
  };
}

async function storedTokens(): Promise<StoredTokens> {
  const tokens = await readTokens();
  if (!tokens) throw new NotConnectedError();
  return tokens;
}

// The owner row, read once per request however many of the functions below ask for it. Never used
// for refreshing (readTokens above): that needs a fresh read.
const readOwnerRow = cache(async () => {
  const { data, error } = await db()
    .from("oauth_tokens")
    .select("access_token_enc, created_at, sessions_valid_after, owner_sub")
    .eq("provider", "tesla")
    .maybeSingle();
  if (error) throw new Error(`Reading account failed: ${error.message}`);
  return data;
});

export async function isConnected(): Promise<boolean> {
  if (DEMO) return true;
  return Boolean((await readOwnerRow())?.access_token_enc);
}

export type AccountInfo = { connected: boolean; connectedSince: string | null };

export async function accountInfo(): Promise<AccountInfo> {
  if (DEMO) return { connected: true, connectedSince: demoData().history.at(-1)?.detected_at ?? null };
  const data = await readOwnerRow();
  return { connected: Boolean(data?.access_token_enc), connectedSince: data?.created_at ?? null };
}

// The Tesla account (id_token `sub`) that owns the dashboard, or null before the first sign-in. The
// session cookie carries no identity: with one owner, a current session is that account's.
export async function ownerSub(): Promise<string | null> {
  if (DEMO) return null;
  return ((await readOwnerRow())?.owner_sub as string | null | undefined) ?? null;
}

// Sessions issued before this time (ms) are revoked. -infinity (never revoked) reads as 0.
// With no owner row (fresh install or deleted account) no existing session is valid.
export async function sessionsValidAfter(): Promise<number> {
  if (DEMO) return 0;
  const data = await readOwnerRow();
  if (!data) return Number.POSITIVE_INFINITY;
  const t = new Date(data.sessions_valid_after).getTime();
  return Number.isFinite(t) ? t : 0;
}

export async function revokeAllSessions(): Promise<void> {
  if (DEMO) return;
  const { error } = await db()
    .from("oauth_tokens")
    .update({ sessions_valid_after: new Date().toISOString() })
    .eq("provider", "tesla");
  if (error) throw new Error(`Signing out everywhere failed: ${error.message}`);
}

// Tell Tesla to stop the car streaming to Uplink, for each of the owner's cars. Best effort: a
// failure is logged and never blocks disconnecting or deleting. Must run before the tokens go.
async function stopStreaming(): Promise<void> {
  try {
    const { data, error } = await db().from("vehicles").select("vin").not("vin", "is", null);
    if (error) throw new Error(error.message);
    const token = await accessToken();
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

// Forget the Tesla tokens but keep owner_sub, so only the same Tesla account can sign in again.
export async function disconnectTesla(): Promise<void> {
  if (DEMO) return;
  await stopStreaming();
  const { error } = await db()
    .from("oauth_tokens")
    .update({
      access_token_enc: null,
      refresh_token_enc: null,
      expires_at: null,
      sessions_valid_after: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("provider", "tesla");
  if (error) throw new Error(`Disconnecting failed: ${error.message}`);
}

async function accessToken(forceRefresh = false): Promise<string> {
  if (DEMO) throw new Error("Tesla is off in demo mode");
  const tokens = await storedTokens();
  if (forceRefresh || tokens.expiresAt - Date.now() < REFRESH_MARGIN_MS) {
    return refresh(tokens);
  }
  return tokens.accessToken;
}

// GET against the Fleet API with the owner's token; retries once after a 401. Returns the raw
// Response, so the caller must check `ok`.
async function fleetFetch(path: string): Promise<Response> {
  let token = await accessToken();
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${fleetApiBase()}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.status === 401 && attempt === 0) {
      token = await accessToken(true);
      continue;
    }
    return res;
  }
}

// Tesla can answer 200 with `response: null`; callers decide what that means.
export async function fleetGet<T>(path: string): Promise<T | null> {
  const res = await fleetFetch(path);
  if (!res.ok) {
    throw new TeslaError(`GET ${path} failed (${res.status}): ${await res.text()}`, res.status);
  }
  const body = (await res.json()) as { response?: T | null } | null;
  return body?.response ?? null;
}

// For binary responses such as invoice PDFs: the body is not JSON, so the caller reads it.
export function fleetGetRaw(path: string): Promise<Response> {
  return fleetFetch(path);
}

// "Delete my data": remove the car's data and the Tesla tokens, and sign out everywhere. Vehicles
// cascade to snapshots and version_history. owner_sub stays, so the dashboard can't be claimed by
// another Tesla account. Release notes are Tesla's public text per version, not the owner's data.
// Charging sessions are the owner's too. Their table may not exist if its migration was never run
// (Postgres 42P01, PostgREST PGRST205), which is fine: there is nothing to delete.
export async function deleteMyData(): Promise<void> {
  if (DEMO) return;
  // Before the vehicles go: it needs their VINs. disconnectTesla below repeats it harmlessly.
  await stopStreaming();
  for (const [table, column] of [
    ["vehicles", "id"],
    ["poll_runs", "id"],
    ["charging_sessions", "session_id"],
    ["stream_charge_sessions", "vin"],
    ["telemetry_readings", "vin"],
  ] as const) {
    const { error } = await db().from(table).delete().not(column, "is", null);
    const optional = table === "charging_sessions" || table === "stream_charge_sessions";
    if (error && !(optional && ["42P01", "PGRST205"].includes(error.code))) {
      throw new Error(`Deleting ${table} failed: ${error.message}`);
    }
  }
  await disconnectTesla();
}
