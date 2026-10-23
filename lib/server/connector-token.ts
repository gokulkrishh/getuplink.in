import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { DEMO } from "@/lib/demo";
import { safeEqual } from "@/lib/session";
import { db } from "./supabase";

// The MCP connector's token (Settings → Integrations), shared by whichever AI uses it: a Grok bot,
// Claude, ChatGPT. Shown once when created; only its hash is stored, so a database leak can't be
// replayed against /api/mcp.

const MIN = 60_000;
// "Last used" is a hint, not a log: one write per this long is plenty.
const USED_EVERY_MS = 5 * MIN;
// No table yet (before the migration): treated as no token.
const MISSING = ["42P01", "PGRST205"];

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export type ConnectorTokenStatus = { createdAt: string; usedAt: string | null } | null;

async function readToken(): Promise<{ token_hash: string; created_at: string; used_at: string | null } | null> {
  const { data, error } = await db().from("connector_token").select("token_hash, created_at, used_at").eq("owner", "tesla").maybeSingle();
  if (error) {
    if (!MISSING.includes(error.code)) console.warn("Connector token unavailable:", error.message);
    return null;
  }
  return data;
}

export async function connectorTokenStatus(): Promise<ConnectorTokenStatus> {
  if (DEMO) return null;
  const row = await readToken();
  return row ? { createdAt: row.created_at, usedAt: row.used_at } : null;
}

// A new token replaces any old one, so the old one stops working at once.
export async function createConnectorToken(): Promise<string> {
  const token = `upl_${randomBytes(32).toString("base64url")}`;
  const { error } = await db()
    .from("connector_token")
    .upsert({ owner: "tesla", token_hash: hash(token), created_at: new Date().toISOString(), used_at: null }, { onConflict: "owner" });
  if (error) throw new Error(`Creating the connector token failed: ${error.message}`);
  return token;
}

export async function revokeConnectorToken(): Promise<void> {
  const { error } = await db().from("connector_token").delete().eq("owner", "tesla");
  if (error && !MISSING.includes(error.code)) throw new Error(`Revoking the connector token failed: ${error.message}`);
}

// Whether a Bearer token is the current one. Compares hashes in constant time.
export async function verifyConnectorToken(token: string | null): Promise<boolean> {
  if (DEMO || !token) return false;
  const row = await readToken();
  if (!row || !safeEqual(hash(token), row.token_hash)) return false;
  if (Date.now() - (row.used_at ? Date.parse(row.used_at) : 0) > USED_EVERY_MS) {
    const { error } = await db().from("connector_token").update({ used_at: new Date().toISOString() }).eq("owner", "tesla");
    if (error) console.warn("Recording connector token use failed:", error.message);
  }
  return true;
}
