import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Google's terms: no Places content on or near a non-Google map, and no resharing it. A Google place's
// name lives only in SpotName.google, which rows, titles and the sheet read. The map, the pin builders and
// the MCP export must never read it, and the live lookup must never sit in a shared cache.
const read = (path: string) => readFileSync(join(import.meta.dir, "..", path), "utf8");
const GOOGLE_NAME = /\.google\b|shownName|withGoogleNames|googlePlaceName/;

describe("Google place names stay off the map and out of exports", () => {
  test("the map components never read a Google name", () => {
    for (const path of ["components/stats/trip-map.tsx", "components/ui/map.tsx", "components/stats/charging-extras.tsx"]) expect(read(path)).not.toMatch(GOOGLE_NAME);
  });

  test("the MCP export never reads a Google name", () => {
    expect(read("lib/server/mcp-data.ts")).not.toMatch(GOOGLE_NAME);
  });

  // The home page refreshes every minute while the car is awake or charging; a live name there would be a
  // Place Details call per refresh. Its loaders (and the shared charging loader) stay Google-free.
  test("the auto-refreshing home page never asks Google for a name", () => {
    for (const path of ["lib/server/home.ts", "lib/server/charging-extra.ts", "app/page.tsx"]) expect(read(path)).not.toMatch(GOOGLE_NAME);
  });

  test("pins take their names through mapName", () => {
    expect(read("lib/server/charging-extra.ts")).toContain("mapName(named.get(s.id))");
    expect(read("components/stats/driving-extras.tsx")).toContain("withCarFlag(mapName(p), p.tag)");
  });

  test("the live lookup asks for displayName only, uncached, and no shared cache holds a Google name", () => {
    const lookup = read("lib/server/google-place-names.ts");
    expect(lookup).toContain('DETAILS_FIELDS = "displayName"');
    expect(lookup).toContain('cache: "no-store"');
    expect(lookup).not.toMatch(/new Map<string, string>\(\)|^const \w+ = new Map/m);
    for (const path of ["lib/server/google-place-names.ts", "lib/server/charging-extra.ts", "lib/server/parked-places.ts", "lib/server/charge-curve.ts", "app/stats/driving/page.tsx", "app/stats/charging/page.tsx"])
      expect(read(path)).not.toMatch(/^\s*"use cache(: remote)?";/m);
  });

  test("search results are asked for uncached and answered no-store", () => {
    const search = read("lib/server/place-suggestions.ts");
    expect(search.match(/cache: "no-store"/g)).toHaveLength(2);
    expect(search).not.toMatch(/^\s*"use cache/m);
    const route = read("app/api/places/autocomplete/route.ts");
    expect(route).toContain('"Cache-Control": "no-store"');
    expect(route).not.toMatch(/^\s*"use cache/m);
  });

  test("the sheet never puts a Google name into the field", () => {
    // A Google pick sends its place ID; only typed text and OpenStreetMap names go in as "name".
    expect(read("components/name-place.tsx")).toMatch(/if \(o\.kind === "google" && o\.placeId\) form\.set\("googlePlaceId", o\.placeId\);\s*else form\.set\("name", o\.name\);/);
  });
});
