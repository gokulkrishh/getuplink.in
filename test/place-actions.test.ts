import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { Owner } from "@/lib/server/data/owner";
import { FakeDb } from "./fake-db";

// The "Name this place" actions against two users' rows: each re-checks the session, and one user never
// reads, renames or removes the other's tags.

let fake: FakeDb;
let signedIn: Owner | null = null;
let missingTable = false;
const tagged: string[] = [];
const fetched: string[] = [];

mock.module("server-only", () => ({}));
// Before the migration PostgREST answers PGRST205 for user_places.
mock.module("@/lib/server/supabase", () => ({ db: () => (missingTable ? { from: () => missing() } : fake.client()) }));
// A query builder whose every step chains, and which resolves to the missing-table error.
function missing(): unknown {
  return new Proxy({}, { get: (_, key) => (key === "then" ? (resolve: (v: unknown) => void) => resolve({ data: null, error: { code: "PGRST205", message: "Could not find the table" } }) : () => missing()) });
}
// The session is this file's to set while its tests run; other files get the real check.
let faking = false;
// Taken before mocking: Bun patches the module in place, so realAuth.currentOwner would become the mock.
const realAuth = { ...(await import("@/lib/server/auth")) };
const realCurrentOwner = realAuth.currentOwner;
mock.module("@/lib/server/auth", () => ({ ...realAuth, currentOwner: async () => (faking ? signedIn : realCurrentOwner()) }));
// Bun's module mocks reach every test file, so the rest of each module stays real.
const realCache = { ...(await import("next/cache")) };
const realNavigation = { ...(await import("next/navigation")) };
mock.module("next/cache", () => ({ ...realCache, updateTag: (tag: string) => tagged.push(tag) }));
mock.module("next/navigation", () => ({
  ...realNavigation,
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
}));
// Any call out (Nominatim, Google) is recorded and answered empty.
globalThis.fetch = (async (url: string | URL) => (fetched.push(String(url)), new Response("{}", { status: 200 }))) as unknown as typeof fetch;

const { asOwner } = await import("@/lib/server/data/owner");
const { placeSuggestions, removePlace, savePlace } = await import("@/app/places/actions");
const { loadUserPlaces } = await import("@/lib/server/user-places");

const A: Owner = asOwner(1, "tesla-a");
const B: Owner = asOwner(2, "tesla-b");

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

afterAll(() => {
  faking = false;
});

beforeEach(() => {
  faking = true;
  signedIn = null;
  missingTable = false;
  tagged.length = 0;
  fetched.length = 0;
  delete process.env.GOOGLE_MAPS_API_KEY;
  process.env.OSM_LOOKUPS = "off";
  fake = new FakeDb({
    user_places: [
      { id: 10, user_id: 1, name: "Maple Court", lat: 10, lng: 20, radius_m: 75, google_place_id: null, updated_at: "2026-10-20T00:00:00Z" },
      { id: 20, user_id: 2, name: "Cedar Park", lat: 11, lng: 21, radius_m: 75, google_place_id: null, updated_at: "2026-10-20T00:00:00Z" },
    ],
    place_names: [],
  });
});

const names = () => fake.rows("user_places").map((r) => `${r.user_id}:${r.name}`);

describe("without a session", () => {
  test("every action redirects and writes nothing", async () => {
    await expect(savePlace(null, form({ name: "Elm Yard", lat: "12", lng: "22" }))).rejects.toThrow("redirect /api/auth/signed-out");
    await expect(savePlace(null, form({ id: "20", name: "Mine now" }))).rejects.toThrow("redirect");
    await expect(removePlace(null, form({ id: "20" }))).rejects.toThrow("redirect");
    await expect(placeSuggestions(12, 22)).rejects.toThrow("redirect");
    expect(names()).toEqual(["1:Maple Court", "2:Cedar Park"]);
    expect(fake.calls).toEqual([]);
    expect(fetched).toEqual([]);
  });
});

describe("signed in as A", () => {
  beforeEach(() => {
    signedIn = A;
  });

  test("a new tag is A's, with the server's radius", async () => {
    expect(await savePlace(null, form({ name: "  Elm   Yard ", lat: "12.5", lng: "22.5", radius_m: "5000" }))).toBeNull();
    const row = fake.rows("user_places").at(-1)!;
    expect(row).toEqual(expect.objectContaining({ user_id: 1, name: "Elm Yard", lat: 12.5, lng: 22.5, radius_m: 75, google_place_id: null }));
    expect(tagged).toEqual(["owner-data"]);
  });

  test("a confirmed Google suggestion keeps only its place id beside the name", async () => {
    expect(await savePlace(null, form({ name: "Orchard Lane Market", lat: "12", lng: "22", placeId: "ChIJmadeUpOrchardMarket01" }))).toBeNull();
    expect(fake.rows("user_places").at(-1)).toEqual(expect.objectContaining({ user_id: 1, google_place_id: "ChIJmadeUpOrchardMarket01" }));
  });

  test("a Google-sourced tag saved again unchanged keeps its place id; a new name drops it", async () => {
    fake.rows("user_places")[0].google_place_id = "ChIJmadeUpOrchardMarket01";
    expect(await savePlace(null, form({ id: "10", name: "Maple Court" }))).toBeNull();
    expect(fake.rows("user_places")[0].google_place_id).toBe("ChIJmadeUpOrchardMarket01");
    expect(await savePlace(null, form({ id: "10", name: "Maple Court East" }))).toBeNull();
    expect(fake.rows("user_places")[0].google_place_id).toBeNull();
  });

  test("renames and removes only A's own tags", async () => {
    expect(await savePlace(null, form({ id: "10", name: "Maple Court East" }))).toBeNull();
    expect(await savePlace(null, form({ id: "20", name: "Taken" }))).toBe("That place is gone.");
    expect(await removePlace(null, form({ id: "20" }))).toBeNull();
    expect(names()).toEqual(["1:Maple Court East", "2:Cedar Park"]);
    expect(await removePlace(null, form({ id: "10" }))).toBeNull();
    expect(names()).toEqual(["2:Cedar Park"]);
    for (const c of fake.calls.filter((c) => c.table === "user_places")) expect(c.filters).toContain("user_id = 1");
  });

  test("bad input is refused before the database", async () => {
    expect(await savePlace(null, form({ name: "", lat: "12", lng: "22" }))).toBe("Give it a name, up to 60 characters.");
    expect(await savePlace(null, form({ name: "x".repeat(61), lat: "12", lng: "22" }))).toBe("Give it a name, up to 60 characters.");
    expect(await savePlace(null, form({ name: "Elm Yard", lat: "999", lng: "22" }))).toBe("That spot isn't known.");
    expect(await savePlace(null, form({ name: "Elm Yard", id: "abc" }))).toBe("That place is gone.");
    expect(await removePlace(null, form({ id: "-1" }))).toBe("That place is gone.");
    expect(fake.calls).toEqual([]);
  });

  test("reads are A's tags only", async () => {
    expect((await loadUserPlaces(A)).map((p) => p.name)).toEqual(["Maple Court"]);
    expect((await loadUserPlaces(B)).map((p) => p.name)).toEqual(["Cedar Park"]);
  });

  test("without a Google key, suggestions never call Google", async () => {
    const result = await placeSuggestions(12, 22);
    expect(result.google).toBe(false);
    expect(fetched.filter((u) => u.includes("googleapis"))).toEqual([]);
    expect(await placeSuggestions(Number.NaN, 22)).toEqual({ items: [], google: false });
  });

  test("with a key, one Nearby Search and one reverse lookup, with a minimal field mask", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    const masks: string[] = [];
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      fetched.push(String(url));
      const mask = new Headers(init?.headers).get("X-Goog-FieldMask");
      if (mask) masks.push(mask);
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    await placeSuggestions(12, 22);
    expect(fetched.filter((u) => u.includes("googleapis"))).toHaveLength(2);
    expect(masks).toEqual(["places.id,places.displayName,places.primaryType,places.types"]);
  });
});

describe("before the migration", () => {
  test("no tags and no errors; saving says it isn't ready", async () => {
    missingTable = true;
    signedIn = A;
    expect(await loadUserPlaces(A)).toEqual([]);
    expect(await savePlace(null, form({ name: "Elm Yard", lat: "12", lng: "22" }))).toBe("Naming places isn't ready yet. Try again later.");
    expect(await removePlace(null, form({ id: "10" }))).toBe("Naming places isn't ready yet. Try again later.");
  });
});
