import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { DEMO } from "@/lib/demo";
import { safeEqual } from "@/lib/session";
import { type Owner, ownerDb } from "./data/owner";
import { connectorTokenAccount } from "./data/system";

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

async function readToken(owner: Owner): Promise<{ token_hash: string; created_at: string; used_at: string | null } | null> {
  const { data, error } = await ownerDb(owner).from("connector_token").select("token_hash, created_at, used_at").maybeSingle();
  if (error) {
    if (!MISSING.includes(error.code)) console.warn("Connector token unavailable:", error.message);
    return null;
  }
  return data;
}

export async function connectorTokenStatus(owner: Owner): Promise<ConnectorTokenStatus> {
  if (DEMO) return null;
  const row = await readToken(owner);
  return row ? { createdAt: row.created_at, usedAt: row.used_at } : null;
}

// A new token replaces any old one, so the old one stops working at once.
export async function createConnectorToken(owner: Owner): Promise<string> {
  const token = `upl_${randomBytes(32).toString("base64url")}`;
  const { error } = await ownerDb(owner)
    .from("connector_token")
    .upsert({ token_hash: hash(token), created_at: new Date().toISOString(), used_at: null }, { onConflict: "user_id" });
  if (error) throw new Error(`Creating the connector token failed: ${error.message}`);
  return token;
}

export async function revokeConnectorToken(owner: Owner): Promise<void> {
  const { error } = await ownerDb(owner).from("connector_token").delete();
  if (error && !MISSING.includes(error.code)) throw new Error(`Revoking the connector token failed: ${error.message}`);
}

// The approved account a Bearer token belongs to, when it is a current one; null otherwise. Looks the
// token up by its hash and compares again in constant time. Every MCP tool then reads and writes as that
// account.
export async function verifyConnectorToken(token: string | null): Promise<Owner | null> {
  if (DEMO || !token) return null;
  const tokenHash = hash(token);
  const row = await connectorTokenAccount(tokenHash);
  if (!row || !safeEqual(tokenHash, row.tokenHash)) return null;
  if (Date.now() - (row.usedAt ? Date.parse(row.usedAt) : 0) > USED_EVERY_MS) {
    const { error } = await ownerDb(row.owner).from("connector_token").update({ used_at: new Date().toISOString() });
    if (error) console.warn("Recording connector token use failed:", error.message);
  }
  return row.owner;
}
