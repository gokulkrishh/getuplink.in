import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Owner } from "@/lib/server/data/owner";
import { FakeDb } from "./fake-db";

// Named MCP connectors: several per account, each with its own token, removed one at a time. Two made-up
// approved users with Tesla access, so one account's connectors never touch the other's.

let fake: FakeDb;

mock.module("server-only", () => ({}));
mock.module("@/lib/server/supabase", () => ({ db: () => fake.client() }));
mock.module("@/lib/server/crypto", () => ({ encrypt: (s: string) => `enc:${s}`, decrypt: (s: string) => s.slice(4) }));
globalThis.fetch = (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;

const { asOwner } = await import("@/lib/server/data/owner");
const { createConnector, listConnectors, removeConnector, verifyConnectorToken } = await import("@/lib/server/connector-token");
const { eraseOwnerRows } = await import("@/lib/server/data/erase");
const { disconnectTesla } = await import("@/lib/server/tesla");

const A: Owner = asOwner(1, "tesla-a");
const B: Owner = asOwner(2, "tesla-b");

beforeEach(() => {
  fake = new FakeDb({
    users: [
      { id: 1, tesla_sub: "tesla-a", status: "approved", sessions_valid_after: "-infinity" },
      { id: 2, tesla_sub: "tesla-b", status: "approved", sessions_valid_after: "-infinity" },
    ],
    user_tokens: [
      { user_id: 1, access_token_enc: "enc:a", refresh_token_enc: "enc:ra", expires_at: new Date(Date.now() + 3_600_000).toISOString() },
      { user_id: 2, access_token_enc: "enc:b", refresh_token_enc: "enc:rb", expires_at: new Date(Date.now() + 3_600_000).toISOString() },
    ],
    connector_token: [],
  });
  fake.autoIds.add("connector_token");
});

async function add(owner: Owner, name: string): Promise<string> {
  const result = await createConnector(owner, name);
  if (!("token" in result)) throw new Error(`refused: ${result.refused}`);
  return result.token;
}

describe("named connectors", () => {
  test("each of several connectors opens its own account, and the list never carries a hash", async () => {
    const claude = await add(A, "Claude");
    const grok = await add(A, "Grok");
    const other = await add(B, "ChatGPT");
    expect(new Set([claude, grok, other]).size).toBe(3);
    expect(await verifyConnectorToken(claude)).toEqual(A);
    expect(await verifyConnectorToken(grok)).toEqual(A);
    expect(await verifyConnectorToken(other)).toEqual(B);
    expect(await verifyConnectorToken("upl_made_up")).toBeNull();

    const list = await listConnectors(A);
    expect(list.map((c) => c.name)).toEqual(["Claude", "Grok"]);
    expect(list.every((c) => !("tokenHash" in c) && !JSON.stringify(c).includes("token_hash"))).toBe(true);
  });

  test("using one connector marks only that one as used", async () => {
    const claude = await add(A, "Claude");
    await add(A, "Grok");
    await verifyConnectorToken(claude);
    const [c, g] = await listConnectors(A);
    expect(c.usedAt).not.toBeNull();
    expect(g.usedAt).toBeNull();
  });

  test("removing one stops its token and leaves the others working", async () => {
    const claude = await add(A, "Claude");
    const grok = await add(A, "Grok");
    const [first] = await listConnectors(A);
    await removeConnector(A, first.id);
    expect(await verifyConnectorToken(claude)).toBeNull();
    expect(await verifyConnectorToken(grok)).toEqual(A);
    expect((await listConnectors(A)).map((c) => c.name)).toEqual(["Grok"]);
  });

  test("another account's id removes nothing", async () => {
    const other = await add(B, "ChatGPT");
    const [theirs] = await listConnectors(B);
    await removeConnector(A, theirs.id);
    expect(await verifyConnectorToken(other)).toEqual(B);
  });

  test("a sixth connector is refused, and adds no row", async () => {
    for (const name of ["One", "Two", "Three", "Four", "Five"]) await add(A, name);
    expect(await createConnector(A, "Six")).toEqual({ refused: "limit" });
    expect((await listConnectors(A)).length).toBe(5);
    // The cap is per account.
    expect("token" in (await createConnector(B, "Claude"))).toBe(true);
  });

  test("names are trimmed and 1 to 40 characters", async () => {
    expect(await createConnector(A, "   ")).toEqual({ refused: "name" });
    expect(await createConnector(A, "x".repeat(41))).toEqual({ refused: "name" });
    expect(await createConnector(A, 42)).toEqual({ refused: "name" });
    await add(A, "  Claude  ");
    await add(A, "x".repeat(40));
    // Counted as the database counts: an emoji is one character, not two.
    await add(A, "🚗".repeat(40));
    expect((await listConnectors(A)).map((c) => c.name)).toEqual(["Claude", "x".repeat(40), "🚗".repeat(40)]);
  });

  test("Delete my data removes every connector of the account, and only its", async () => {
    const claude = await add(A, "Claude");
    const grok = await add(A, "Grok");
    const other = await add(B, "ChatGPT");
    await eraseOwnerRows(A);
    expect(await listConnectors(A)).toEqual([]);
    expect(await verifyConnectorToken(claude)).toBeNull();
    expect(await verifyConnectorToken(grok)).toBeNull();
    expect(await verifyConnectorToken(other)).toEqual(B);
  });

  test("Disconnect Tesla removes every connector of the account", async () => {
    await add(A, "Claude");
    await add(A, "Grok");
    await add(B, "ChatGPT");
    await disconnectTesla(A);
    expect(await listConnectors(A)).toEqual([]);
    expect((await listConnectors(B)).map((c) => c.name)).toEqual(["ChatGPT"]);
  });
});
