import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { matches, mergeSuggestions, nominatimName, parseAutocomplete, parseNearby, parseQuery, parseSessionToken, placeIcon, type Suggestion, typeWords } from "@/lib/place-suggestions";
import { stationsNear } from "@/lib/stations";

// Google's replies in their real shape, with made-up places (test/fixtures).
const fixture = (name: string): unknown => JSON.parse(readFileSync(join(import.meta.dir, "fixtures", name), "utf8"));

describe("parseNearby", () => {
  test("charging stations first, then the rest in Google's order, each with its place ID; incomplete entries skipped", () => {
    expect(parseNearby(fixture("google-nearby.json"))).toEqual([
      { name: "Brightwell Charging Hub", detail: "Charging station", source: "google", placeId: "ChIJmadeUpBrightwellHub01" },
      { name: "Orchard Lane Market", detail: "Shopping mall", source: "google", placeId: "ChIJmadeUpOrchardMarket01" },
      // Juniper Café has no ID in the reply, so it can't be picked and is left out.
    ]);
  });

  test("an empty or odd reply is no suggestions", () => {
    expect(parseNearby({})).toEqual([]);
    expect(parseNearby(null)).toEqual([]);
    expect(parseNearby({ places: "nope" })).toEqual([]);
  });
});

describe("parseAutocomplete", () => {
  test("place predictions with an ID and a name, in Google's order; query predictions and incomplete ones skipped", () => {
    expect(parseAutocomplete(fixture("google-autocomplete.json"))).toEqual([
      { name: "Brightwell Fuel Station", detail: "Ring Road, Riverton", source: "google", placeId: "ChIJmadeUpBrightwellFuel1" },
      { name: "Brightwell Charging Hub", detail: null, source: "google", placeId: "ChIJmadeUpBrightwellHub01" },
    ]);
  });

  test("an empty or odd reply is no places", () => {
    expect(parseAutocomplete({})).toEqual([]);
    expect(parseAutocomplete(null)).toEqual([]);
    expect(parseAutocomplete({ suggestions: "nope" })).toEqual([]);
  });
});

test("parseQuery takes 2 to 80 characters, spaces squeezed", () => {
  expect(parseQuery("  orchard   lane ")).toBe("orchard lane");
  expect(parseQuery("o")).toBeNull();
  expect(parseQuery("   ")).toBeNull();
  expect(parseQuery("x".repeat(81))).toBeNull();
  expect(parseQuery(42)).toBeNull();
});

test("parseSessionToken takes a UUID-like token only", () => {
  expect(parseSessionToken("0b6f3c1e-8d2a-4f7b-9c1d-2e3f4a5b6c7d")).toBe("0b6f3c1e-8d2a-4f7b-9c1d-2e3f4a5b6c7d");
  expect(parseSessionToken("short")).toBeNull();
  expect(parseSessionToken("0b6f3c1e 8d2a 4f7b 9c1d")).toBeNull();
  expect(parseSessionToken(undefined)).toBeNull();
});

test("matches wants every typed word in the name or detail, ignoring case", () => {
  const s: Suggestion = { name: "Orchard Lane Market", detail: "Shopping mall", source: "google" };
  expect(matches(s, "orch")).toBe(true);
  expect(matches(s, "lane mall")).toBe(true);
  expect(matches(s, "lane fuel")).toBe(false);
});

describe("nominatimName", () => {
  test("the suburb and the city from OpenStreetMap's reverse lookup", () => {
    expect(nominatimName(fixture("nominatim-reverse.json"))).toBe("Hillgrove, Riverton");
  });

  test("a town stands in for a city, and a name isn't repeated", () => {
    expect(nominatimName({ address: { village: "Elm Ford", town: "Elm Ford" } })).toBe("Elm Ford");
    expect(nominatimName({ name: "Cedar Point", address: { county: "Riverton" } })).toBe("Cedar Point, Riverton");
  });

  test("nothing usable is no name", () => {
    expect(nominatimName({ error: "Unable to geocode" })).toBeNull();
    expect(nominatimName(null)).toBeNull();
  });
});

test("typeWords", () => {
  expect(typeWords("shopping_mall")).toBe("Shopping mall");
  expect(typeWords("Bad Type!")).toBeNull();
  expect(typeWords(undefined)).toBeNull();
});

test("mergeSuggestions keeps the first of each name, best source first", () => {
  const google: Suggestion = { name: "Brightwell Charging Hub", detail: null, source: "google" };
  const osm: Suggestion = { name: "brightwell charging hub", detail: "Charging station", source: "station" };
  const area: Suggestion = { name: "Hillgrove, Riverton", detail: "Area", source: "area" };
  expect(mergeSuggestions([[google], [osm, area]])).toEqual([google, area]);
  expect(mergeSuggestions([[google, area]], 1)).toEqual([google]);
});

test("stationsNear lists every station within 150 m, nearest first", () => {
  const stations: [string, string, string, number, number][] = [
    ["Far", "FarCo", "Elsewhere", 10.01, 20],
    ["Near", "VoltPoint", "Hillgrove", 10.0005, 20],
    ["Nearest", "", "", 10.0001, 20],
  ];
  expect(stationsNear(10, 20, stations)).toEqual(["Nearest", "VoltPoint, Hillgrove"]);
});

// The round icon beside each choice in "Name this place": chargers get the bolt, the area a target, the rest a pin.
describe("placeIcon", () => {
  test("a charging station is a charger, from OpenStreetMap or from Google's nearby places", () => {
    expect(placeIcon({ name: "Tata Power EZ Charge", detail: "Charging station", source: "station" })).toBe("charging");
    // The shape Nearby Search answers with, parsed as the sheet gets it.
    const [hub] = parseNearby({ places: [{ id: "ChIJ1", displayName: { text: "Brightwell Charging Hub" }, primaryType: "electric_vehicle_charging_station", types: ["electric_vehicle_charging_station", "point_of_interest"] }] });
    expect(placeIcon(hub!)).toBe("charging");
  });
  test("the area is an area", () => {
    expect(placeIcon({ name: "Koramangala, Bengaluru", detail: "Area", source: "area" })).toBe("area");
  });
  test("any other place is a place, including a search result whose detail is an address", () => {
    const [mall] = parseNearby({ places: [{ id: "ChIJ2", displayName: { text: "Orchard Lane Market" }, primaryType: "shopping_mall" }] });
    expect(placeIcon(mall!)).toBe("place");
    const [found] = parseAutocomplete({ suggestions: [{ placePrediction: { placeId: "ChIJ3", structuredFormat: { mainText: { text: "Charging Lane Café" }, secondaryText: { text: "MG Road, Bengaluru" } } } }] });
    expect(placeIcon(found!)).toBe("place");
  });
});
