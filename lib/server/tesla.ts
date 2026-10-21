import "server-only";
import { decrypt, encrypt } from "./crypto";
import { env, fleetApiBase } from "./env";
import { db } from "./supabase";

export const AUTHORIZE_URL = "https://auth.tesla.com/oauth2/v3/authorize";
export const TOKEN_URL = "https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token";
export const SCOPES = "openid offline_access vehicle_device_data";

// Refresh a little early so a token never expires mid-poll.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
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

async function saveTokens(tokens: TokenResponse): Promise<string> {
  const { error } = await db()
    .from("oauth_tokens")
    .upsert({
      provider: "tesla",
      access_token_enc: encrypt(tokens.access_token),
      refresh_token_enc: encrypt(tokens.refresh_token),
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scope: tokens.scope ?? null,
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error(`Saving tokens failed: ${error.message}`);
  return tokens.access_token;
}

export async function exchangeCode(code: string): Promise<void> {
  const tokens = await tokenRequest({
    grant_type: "authorization_code",
    client_id: env("TESLA_CLIENT_ID"),
    client_secret: env("TESLA_CLIENT_SECRET"),
    code,
    audience: fleetApiBase(),
    redirect_uri: env("TESLA_REDIRECT_URI"),
  });
  await saveTokens(tokens);
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
  if (!data) throw new NotConnectedError();
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
    .eq("provider", "tesla");
  if (error) throw new Error(`Reading tokens failed: ${error.message}`);
  return (count ?? 0) > 0;
}

async function accessToken(forceRefresh = false): Promise<string> {
  const tokens = await storedTokens();
  if (forceRefresh || tokens.expiresAt - Date.now() < REFRESH_MARGIN_MS) {
    return refresh(tokens.refreshToken);
  }
  return tokens.accessToken;
}

// GET against the Fleet API with the owner's token; retries once after a 401.
export async function fleetGet<T>(path: string): Promise<T> {
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
    if (!res.ok) {
      throw new TeslaError(`GET ${path} failed (${res.status}): ${await res.text()}`, res.status);
    }
    const body = (await res.json()) as { response: T };
    return body.response;
  }
}
