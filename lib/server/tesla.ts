import "server-only";
import { decrypt, encrypt } from "./crypto";
import { env, fleetApiBase } from "./env";
import { db } from "./supabase";

export const AUTHORIZE_URL = "https://auth.tesla.com/oauth2/v3/authorize";
export const TOKEN_URL = "https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token";
// Supercharger history needs this extra scope, which the owner must first enable in the Tesla
// developer app. It is off until TESLA_CHARGING=1, so sign-in keeps working before that.
const CHARGING_SCOPE = "vehicle_charging_cmds";
export const SCOPES = [
  "openid",
  "offline_access",
  "vehicle_device_data",
  ...(process.env.TESLA_CHARGING === "1" ? [CHARGING_SCOPE] : []),
].join(" ");

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
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new TeslaError(`Token request failed (${res.status}): ${await res.text()}`, res.status);
  }
  return res.json();
}

// Omitting ownerSub leaves the stored owner untouched (upsert only sets given columns).
async function saveTokens(tokens: TokenResponse, ownerSub?: string): Promise<string> {
  const { error } = await db()
    .from("oauth_tokens")
    .upsert({
      provider: "tesla",
      ...(ownerSub ? { owner_sub: ownerSub } : {}),
      access_token_enc: encrypt(tokens.access_token),
      refresh_token_enc: encrypt(tokens.refresh_token),
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scope: tokens.scope ?? null,
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error(`Saving tokens failed: ${error.message}`);
  return tokens.access_token;
}

// The token came straight from Tesla's token endpoint over TLS, so reading the
// payload without verifying the signature is enough to learn who signed in.
function idTokenSubject(idToken: string | undefined): string {
  const payload = idToken?.split(".")[1];
  const sub = payload ? (JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub?: string }).sub : undefined;
  if (!sub) throw new Error("Tesla did not return an id_token with a subject");
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
  const { data, error } = await db().from("oauth_tokens").select("owner_sub").eq("provider", "tesla").maybeSingle();
  if (error) throw new Error(`Reading owner failed: ${error.message}`);
  if (data?.owner_sub && data.owner_sub !== sub) return "not-owner";
  await saveTokens(tokens, sub);
  return data?.owner_sub ? "owner" : "claimed";
}

// Refresh tokens are single use: the new one must be stored before anything else.
async function refresh(refreshToken: string): Promise<string> {
  const tokens = await tokenRequest({
    grant_type: "refresh_token",
    client_id: env("TESLA_CLIENT_ID"),
    refresh_token: refreshToken,
  });
  return saveTokens(tokens);
}

async function storedTokens() {
  const { data, error } = await db()
    .from("oauth_tokens")
    .select("access_token_enc, refresh_token_enc, expires_at")
    .eq("provider", "tesla")
    .maybeSingle();
  if (error) throw new Error(`Reading tokens failed: ${error.message}`);
  if (!data?.access_token_enc || !data.refresh_token_enc || !data.expires_at) throw new NotConnectedError();
  return {
    accessToken: decrypt(data.access_token_enc),
    refreshToken: decrypt(data.refresh_token_enc),
    expiresAt: new Date(data.expires_at).getTime(),
  };
}

export async function isConnected(): Promise<boolean> {
  const { count, error } = await db()
    .from("oauth_tokens")
    .select("provider", { count: "exact", head: true })
    .eq("provider", "tesla")
    .not("access_token_enc", "is", null);
  if (error) throw new Error(`Reading tokens failed: ${error.message}`);
  return (count ?? 0) > 0;
}

export type AccountInfo = { connected: boolean; connectedSince: string | null };

export async function accountInfo(): Promise<AccountInfo> {
  const { data, error } = await db()
    .from("oauth_tokens")
    .select("access_token_enc, created_at")
    .eq("provider", "tesla")
    .maybeSingle();
  if (error) throw new Error(`Reading account failed: ${error.message}`);
  return { connected: Boolean(data?.access_token_enc), connectedSince: data?.created_at ?? null };
}

// Sessions issued before this time (ms) are revoked. -infinity (never revoked) reads as 0.
// With no owner row (fresh install or deleted account) no existing session is valid.
export async function sessionsValidAfter(): Promise<number> {
  const { data, error } = await db().from("oauth_tokens").select("sessions_valid_after").eq("provider", "tesla").maybeSingle();
  if (error) throw new Error(`Reading sessions failed: ${error.message}`);
  if (!data) return Number.POSITIVE_INFINITY;
  const t = new Date(data.sessions_valid_after).getTime();
  return Number.isFinite(t) ? t : 0;
}

export async function revokeAllSessions(): Promise<void> {
  const { error } = await db()
    .from("oauth_tokens")
    .update({ sessions_valid_after: new Date().toISOString() })
    .eq("provider", "tesla");
  if (error) throw new Error(`Signing out everywhere failed: ${error.message}`);
}

// Forget the Tesla tokens but keep owner_sub, so only the same Tesla account can sign in again.
export async function disconnectTesla(): Promise<void> {
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
  const tokens = await storedTokens();
  if (forceRefresh || tokens.expiresAt - Date.now() < REFRESH_MARGIN_MS) {
    return refresh(tokens.refreshToken);
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

export async function fleetGet<T>(path: string): Promise<T> {
  const res = await fleetFetch(path);
  if (!res.ok) {
    throw new TeslaError(`GET ${path} failed (${res.status}): ${await res.text()}`, res.status);
  }
  const body = (await res.json()) as { response: T };
  return body.response;
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
  for (const [table, column] of [
    ["vehicles", "id"],
    ["poll_runs", "id"],
    ["charging_sessions", "session_id"],
  ] as const) {
    const { error } = await db().from(table).delete().not(column, "is", null);
    if (error && !(table === "charging_sessions" && ["42P01", "PGRST205"].includes(error.code))) {
      throw new Error(`Deleting ${table} failed: ${error.message}`);
    }
  }
  await disconnectTesla();
}
