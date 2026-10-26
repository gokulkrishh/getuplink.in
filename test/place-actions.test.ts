import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { Owner } from "@/lib/server/data/owner";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FakeDb } from "./fake-db";

const readFixture = (name: string) => readFileSync(join(import.meta.dir, "fixtures", name), "utf8");

// The "Name this place" actions against two users' rows: each re-checks the session, and one user never
// reads, renames or removes the other's tags.

let fake: FakeDb;
let signedIn: Owner | null = null;
let missingTable = false;
let missingColumn = false;
const tagged: string[] = [];
const fetched: string[] = [];

mock.module("server-only", () => ({}));
// Before the first migration PostgREST answers PGRST205 for user_places; before the google_place_id one,
// 42703 for a select naming the column and PGRST204 for a write carrying it.
mock.module("@/lib/server/supabase", () => ({ db: () => (missingTable ? { from: () => missing() } : missingColumn ? withoutGoogleColumn(fake.client()) : fake.client()) }));
// A query builder whose every step chains, and which resolves to the given error.
function missing(code = "PGRST205"): unknown {
  return new Proxy({}, { get: (_, key) => (key === "then" ? (resolve: (v: unknown) => void) => resolve({ data: null, error: { code, message: "Not found" } }) : () => missing(code)) });
}
function withoutGoogleColumn(client: ReturnType<FakeDb["client"]>) {
  return {
    ...client,
    from: (table: string) => {
      const q = client.from(table);
      return new Proxy(q, {
        get(target, key) {
          const v = Reflect.get(target, key) as unknown;
          if (key === "select") return (cols?: string) => (cols?.includes("google_place_id") ? missing("42703") : target.select());
          if (key === "insert" || key === "update")
            return (row: Record<string, unknown>) => ("google_place_id" in row ? missing("PGRST204") : key === "insert" ? target.insert(row) : target.update(row));
          return typeof v === "function" ? v.bind(target) : v;
        },
      });
    },
  };
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
const answerEmpty = (async (url: string | URL) => (fetched.push(String(url)), new Response("{}", { status: 200 }))) as unknown as typeof fetch;
globalThis.fetch = answerEmpty;

const { asOwner } = await import("@/lib/server/data/owner");
const { placeSuggestions, removePlace, savePlace } = await import("@/app/places/actions");
const { loadUserPlaces } = await import("@/lib/server/user-places");
const { withGoogleNames } = await import("@/lib/server/google-place-names");
const { shownName, spotName } = await import("@/lib/charge-names");

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
  missingColumn = false;
  tagged.length = 0;
  fetched.length = 0;
  globalThis.fetch = answerEmpty;
  delete process.env.GOOGLE_MAPS_API_KEY;
  process.env.OSM_LOOKUPS = "off";
  fake = new FakeDb({
    user_places: [
      { id: 10, user_id: 1, name: "Maple Court", lat: 10, lng: 20, radius_m: 75, updated_at: "2026-10-20T00:00:00Z" },
      { id: 20, user_id: 2, name: "Cedar Park", lat: 11, lng: 21, radius_m: 75, updated_at: "2026-10-20T00:00:00Z" },
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
    expect(row).toEqual(expect.objectContaining({ user_id: 1, name: "Elm Yard", lat: 12.5, lng: 22.5, radius_m: 75 }));
    expect(tagged).toEqual(["owner-data"]);
  });

  test("only the typed name is kept: nothing from Google rides along", async () => {
    expect(await savePlace(null, form({ name: "Elm Yard", lat: "12", lng: "22", placeId: "ChIJmadeUpOrchardMarket01", google_place_id: "x" }))).toBeNull();
    const row = fake.rows("user_places").at(-1)!;
    expect(Object.keys(row).sort()).toEqual(["created_at", "lat", "lng", "name", "radius_m", "updated_at", "user_id"]);
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

  test("without a Google key, suggestions never call or count Google", async () => {
    const result = await placeSuggestions(12, 22);
    expect(result.hints).toEqual([]);
    expect(fetched.filter((u) => u.includes("googleapis"))).toEqual([]);
    expect(fake.rpcs).toEqual([]);
    expect(await placeSuggestions(Number.NaN, 22)).toEqual({ hints: [], picks: [], tappable: false, current: null });
  });

  test("with a key, one Nearby Search Pro and one Geocoding call, each counted under its SKU", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    const masks: string[] = [];
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      fetched.push(String(url));
      const mask = new Headers(init?.headers).get("X-Goog-FieldMask");
      if (mask) masks.push(mask);
      const body = String(url).includes("geocode") ? readFixture("google-reverse.json") : readFixture("google-nearby.json");
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch;
    const result = await placeSuggestions(12, 22);
    expect(fetched.filter((u) => u.includes("googleapis"))).toHaveLength(2);
    // The ID is an IDs Only field: the call stays Nearby Search Pro.
    expect(masks).toEqual(["places.id,places.displayName,places.primaryType,places.types"]);
    expect(fake.rpcs.map((r) => r.args.p_sku).sort()).toEqual(["geocoding", "nearbySearchPro"]);
    expect(fake.rpcs.every((r) => r.fn === "increment_google_usage" && r.args.p_n === 1)).toBe(true);
    expect(result.hints.map((h) => h.name)).toEqual(["Brightwell Charging Hub", "Orchard Lane Market", "Juniper Café", "14, Orchard Lane, Hillgrove"]);
    // Places with an ID can be tapped; the street address can't.
    expect(result.hints.map((h) => h.placeId ?? null)).toEqual(["ChIJmadeUpBrightwellHub01", "ChIJmadeUpOrchardMarket01", null, null]);
    expect(result.tappable).toBe(true);
    // Suggestions are never written anywhere.
    expect(fake.calls.filter((c) => c.op !== "select")).toEqual([]);
  });

  test("tapping a Google place saves only its place ID: no name, nothing else from Google", async () => {
    // The browser's field might hold anything; with a place ID the typed name is ignored.
    expect(await savePlace(null, form({ googlePlaceId: "ChIJmadeUpOrchardMarket01", name: "Orchard Lane Market", lat: "12", lng: "22" }))).toBeNull();
    const row = fake.rows("user_places").at(-1)!;
    expect(row).toEqual(expect.objectContaining({ user_id: 1, name: null, google_place_id: "ChIJmadeUpOrchardMarket01", radius_m: 75 }));
    expect(Object.keys(row).sort()).toEqual(["created_at", "google_place_id", "lat", "lng", "name", "radius_m", "updated_at", "user_id"]);
    expect(JSON.stringify(row)).not.toContain("Orchard Lane Market");
    // Saving makes no Google call.
    expect(fetched.filter((u) => u.includes("googleapis"))).toEqual([]);
    expect(tagged).toEqual(["owner-data"]);
  });

  test("a rename switches between a typed name and a Google place, writing both columns", async () => {
    expect(await savePlace(null, form({ id: "10", googlePlaceId: "ChIJmadeUpOrchardMarket01" }))).toBeNull();
    expect(fake.rows("user_places")[0]).toEqual(expect.objectContaining({ id: 10, name: null, google_place_id: "ChIJmadeUpOrchardMarket01" }));
    expect(await savePlace(null, form({ id: "10", name: "Maple Court" }))).toBeNull();
    expect(fake.rows("user_places")[0]).toEqual(expect.objectContaining({ id: 10, name: "Maple Court", google_place_id: null }));
    // Another user's tag is out of reach either way.
    expect(await savePlace(null, form({ id: "20", googlePlaceId: "ChIJmadeUpOrchardMarket01" }))).toBe("That place is gone.");
  });

  test("a bad place ID is refused before the database", async () => {
    expect(await savePlace(null, form({ googlePlaceId: "not an id!", lat: "12", lng: "22" }))).toBe("That place isn't known.");
    expect(fake.calls).toEqual([]);
  });

  test("a Google-tagged place's name is fetched live with displayName only, counted, and never stored", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    fake.rows("user_places").push({ id: 30, user_id: 1, name: null, google_place_id: "ChIJmadeUpOrchardMarket01", lat: 12, lng: 22, radius_m: 75, updated_at: "2026-10-21T00:00:00Z" });
    const seen: { url: string; mask: string | null; cache: RequestCache | undefined }[] = [];
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      fetched.push(String(url));
      seen.push({ url: String(url), mask: new Headers(init?.headers).get("X-Goog-FieldMask"), cache: init?.cache });
      return new Response(JSON.stringify({ displayName: { text: "Orchard Lane Market", languageCode: "en" } }), { status: 200 });
    }) as unknown as typeof fetch;
    const tags = await loadUserPlaces(A);
    expect(tags.find((t) => t.id === 30)).toEqual(expect.objectContaining({ name: null, googlePlaceId: "ChIJmadeUpOrchardMarket01" }));
    const spot = spotName(tags, { lat: 12, lng: 22 }, { place: "Hillgrove, Riverton" });
    const [named] = await withGoogleNames([spot]);
    expect(named.google).toBe("Orchard Lane Market");
    // The pin-safe name is untouched: the area.
    expect(named.name).toEqual({ text: "Hillgrove, Riverton", source: "place" });
    expect(seen).toEqual([{ url: "https://places.googleapis.com/v1/places/ChIJmadeUpOrchardMarket01?languageCode=en", mask: "displayName", cache: "no-store" }]);
    expect(fake.rpcs.map((r) => r.args.p_sku)).toEqual(["placeDetailsPro"]);
    // Asked again on the next request: nothing was kept between them, in memory or in the database.
    await withGoogleNames([spot]);
    expect(seen).toHaveLength(2);
    expect(fake.rpcs.map((r) => r.args.p_sku)).toEqual(["placeDetailsPro", "placeDetailsPro"]);
    expect(fake.calls.filter((c) => c.op !== "select")).toEqual([]);
    expect(JSON.stringify(fake.tables)).not.toContain("Orchard Lane Market");
  });

  test("the sheet shows the tag's current Google name, looked up by the owner's own tag only", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    fake.rows("user_places").push({ id: 30, user_id: 1, name: null, google_place_id: "ChIJmadeUpOrchardMarket01", lat: 12, lng: 22, radius_m: 75, updated_at: "2026-10-21T00:00:00Z" });
    fake.rows("user_places").push({ id: 40, user_id: 2, name: null, google_place_id: "ChIJmadeUpBrightwellHub01", lat: 12, lng: 22, radius_m: 75, updated_at: "2026-10-21T00:00:00Z" });
    globalThis.fetch = (async (url: string | URL) => {
      fetched.push(String(url));
      if (String(url).includes("/v1/places/")) return new Response(JSON.stringify({ displayName: { text: "Orchard Lane Market" } }), { status: 200 });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    expect((await placeSuggestions(12, 22, 30)).current).toBe("Orchard Lane Market");
    // B's tag id finds nothing for A: no lookup.
    fetched.length = 0;
    expect((await placeSuggestions(12, 22, 40)).current).toBeNull();
    expect(fetched.filter((u) => u.includes("/v1/places/"))).toEqual([]);
  });

  test("without a key, or when Google fails, a Google-tagged place shows its area and nothing is counted", async () => {
    const tag = { id: 30, name: null, googlePlaceId: "ChIJmadeUpOrchardMarket01", lat: 12, lng: 22, radiusM: 75 };
    const spot = spotName([tag], { lat: 12, lng: 22 }, { place: "Hillgrove, Riverton" });
    const [noKey] = await withGoogleNames([spot]);
    expect(shownName(noKey)).toEqual({ text: "Hillgrove, Riverton", google: false });
    expect(fetched).toEqual([]);
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    globalThis.fetch = (async (url: string | URL) => (fetched.push(String(url)), new Response("oops", { status: 500 }))) as unknown as typeof fetch;
    const [failed] = await withGoogleNames([spot]);
    expect(shownName(failed)).toEqual({ text: "Hillgrove, Riverton", google: false });
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const [down] = await withGoogleNames([spot]);
    expect(shownName(down)).toEqual({ text: "Hillgrove, Riverton", google: false });
    expect(fake.rpcs).toEqual([]);
  });

  test("a Google call that fails isn't counted", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    globalThis.fetch = (async (url: string | URL) => (fetched.push(String(url)), new Response("denied", { status: 403 }))) as unknown as typeof fetch;
    expect((await placeSuggestions(12, 22)).hints).toEqual([]);
    expect(fake.rpcs).toEqual([]);
  });
});

describe("before the google_place_id migration", () => {
  test("tags still load, typed names still save, and Google places can't be tapped", async () => {
    missingColumn = true;
    signedIn = A;
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    globalThis.fetch = (async (url: string | URL) => (fetched.push(String(url)), new Response(readFixture("google-nearby.json"), { status: 200 }))) as unknown as typeof fetch;
    expect((await loadUserPlaces(A)).map((p) => p.name)).toEqual(["Maple Court"]);
    expect((await placeSuggestions(12, 22)).tappable).toBe(false);
    expect(await savePlace(null, form({ googlePlaceId: "ChIJmadeUpOrchardMarket01", lat: "12", lng: "22" }))).toBe("Naming places isn't ready yet. Try again later.");
    expect(await savePlace(null, form({ name: "Elm Yard", lat: "12", lng: "22" }))).toBeNull();
    expect(await savePlace(null, form({ id: "10", name: "Maple Court East" }))).toBeNull();
    expect(names()).toEqual(["1:Maple Court East", "2:Cedar Park", "1:Elm Yard"]);
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
