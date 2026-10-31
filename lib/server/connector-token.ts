import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { type Connector, CONNECTOR_LIMIT, connectorName } from "@/lib/connectors";
import { DEMO } from "@/lib/demo";
import { safeEqual } from "@/lib/session";
import { type Owner, ownerDb } from "./data/owner";
import { connectorTokenAccount } from "./data/system";

// The MCP connectors (Settings → Connect your AI): up to 5 per account, one per AI app (a Grok bot, Claude,
// ChatGPT), each named and removed on its own. A token is shown once when created; only its hash is
// stored, so a database leak can't be replayed against /api/mcp.

const MIN = 60_000;
// "Last used" is a hint, not a log: one write per this long is plenty.
const USED_EVERY_MS = 5 * MIN;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

// Demo mode has no database: two made-up connectors, so the section shows what a set-up account sees.
function demoConnectors(): Connector[] {
  const now = Date.now();
  return [
    { id: 1, name: "Claude", createdAt: new Date(now - 9 * 24 * 60 * MIN).toISOString(), usedAt: new Date(now - 2 * 60 * MIN).toISOString() },
    { id: 2, name: "Grok", createdAt: new Date(now - 24 * 60 * MIN).toISOString(), usedAt: null },
  ];
}

// The account's connectors, oldest first. Never the hashes.
export async function listConnectors(owner: Owner): Promise<Connector[]> {
  if (DEMO) return demoConnectors();
  const { data, error } = await ownerDb(owner).from("connector_token").select("id, name, created_at, used_at").order("created_at");
  if (error) throw new Error(`Reading the connectors failed: ${error.message}`);
  return (data ?? []).map((r) => ({ id: Number(r.id), name: r.name as string, createdAt: r.created_at as string, usedAt: (r.used_at as string | null) ?? null }));
}

export type CreateResult = { token: string } | { refused: "name" | "limit" };

// A new named connector and its token, which is returned this once. Refused past the cap, or for a name
// that's blank or too long.
export async function createConnector(owner: Owner, rawName: unknown): Promise<CreateResult> {
  const name = connectorName(rawName);
  if (!name) return { refused: "name" };
  const existing = await ownerDb(owner).from("connector_token").select("id");
  if (existing.error) throw new Error(`Reading the connectors failed: ${existing.error.message}`);
  if ((existing.data?.length ?? 0) >= CONNECTOR_LIMIT) return { refused: "limit" };
  const token = `upl_${randomBytes(32).toString("base64url")}`;
  const { error } = await ownerDb(owner).from("connector_token").insert({ name, token_hash: hash(token), created_at: new Date().toISOString(), used_at: null });
  if (error) throw new Error(`Creating the connector failed: ${error.message}`);
  return { token };
}

// One of the account's connectors; its token stops working at once. Another account's id matches nothing.
export async function removeConnector(owner: Owner, id: number): Promise<void> {
  const { error } = await ownerDb(owner).from("connector_token").delete().eq("id", id);
  if (error) throw new Error(`Removing the connector failed: ${error.message}`);
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
    const { error } = await ownerDb(row.owner).from("connector_token").update({ used_at: new Date().toISOString() }).eq("id", row.id);
    if (error) console.warn("Recording connector use failed:", error.message);
  }
  return row.owner;
}
