import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mergeSuggestions, nominatimName, parseNearby, parseReverse, type Suggestion, typeWords } from "@/lib/place-suggestions";
import { stationsNear } from "@/lib/stations";

// Google's replies in their real shape, with made-up places (test/fixtures).
const fixture = (name: string): unknown => JSON.parse(readFileSync(join(import.meta.dir, "fixtures", name), "utf8"));

describe("parseNearby", () => {
  test("charging stations first, then the rest in Google's order; incomplete entries skipped", () => {
    expect(parseNearby(fixture("google-nearby.json"))).toEqual([
      { name: "Brightwell Charging Hub", detail: "Charging station", source: "google" },
      { name: "Orchard Lane Market", detail: "Shopping mall", source: "google" },
      { name: "Juniper Café", detail: null, source: "google" },
    ]);
  });

  test("an empty or odd reply is no suggestions", () => {
    expect(parseNearby({})).toEqual([]);
    expect(parseNearby(null)).toEqual([]);
    expect(parseNearby({ places: "nope" })).toEqual([]);
  });
});

describe("parseReverse", () => {
  test("the first street result, without the plus code, postcode or country", () => {
    expect(parseReverse(fixture("google-reverse.json"))).toEqual({
      name: "14, Orchard Lane, Hillgrove",
      detail: "Street address",
      source: "google",
    });
  });

  test("a failed or empty lookup is nothing", () => {
    expect(parseReverse({ status: "ZERO_RESULTS", results: [] })).toBeNull();
    expect(parseReverse({ status: "REQUEST_DENIED", error_message: "x" })).toBeNull();
    expect(parseReverse("oops")).toBeNull();
  });
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
