import { describe, expect, test } from "bun:test";
import { chargeName, chargeSpot, chargeType, googleMapsUrl, invoiceName, mapName, nameAction, needsName, shownName, spotName, routeNames, withCarFlag } from "@/lib/charge-names";
import type { UserPlace } from "@/lib/user-places";

describe("chargeName", () => {
  const invoice = { network: "VoltPoint", station: "Lakeview Fuels, Ring Road, Hillgrove" };

  test("a station OpenStreetMap doesn't know is named from its invoice", () => {
    expect(chargeName({ station: null, invoice, place: "Hillgrove, Riverton" })).toEqual({ text: "VoltPoint, Lakeview Fuels", source: "invoice" });
  });

  test("an invoice's station comes before the station check's match: the bill names the exact station", () => {
    expect(chargeName({ station: "Magenta ChargeGrid, BTM Layout", invoice, site: "Bengaluru, Orion Mall", place: "BTM Layout, Bengaluru" })).toEqual({
      text: "VoltPoint, Lakeview Fuels",
      source: "invoice",
    });
    expect(chargeName({ station: "Magenta ChargeGrid, BTM Layout", invoice: null, place: "BTM Layout, Bengaluru" })).toEqual({
      text: "Magenta ChargeGrid, BTM Layout",
      source: "station",
    });
  });

  test("then a Supercharger's site, then the area name", () => {
    expect(chargeName({ site: "Bengaluru, Orion Mall", place: "Rajajinagar, Bengaluru" })).toEqual({ text: "Supercharger, Orion Mall", source: "supercharger" });
    expect(chargeName({ station: null, invoice: null, site: null, place: "Koramangala, Bengaluru" })).toEqual({ text: "Koramangala, Bengaluru", source: "place" });
  });

  test("nothing known is no name, never a guess", () => {
    expect(chargeName({})).toBeNull();
    expect(chargeName({ station: "  ", invoice: { network: " ", station: "" }, site: "", place: "" })).toBeNull();
  });

  test("the owner's own name ranks above every other source", () => {
    expect(chargeName({ tag: "Maple Court", station: "Magenta ChargeGrid, BTM Layout", invoice, site: "Bengaluru, Orion Mall", place: "BTM Layout, Bengaluru" })).toEqual({
      text: "Maple Court",
      source: "tag",
    });
    // A blank tag is no tag.
    expect(chargeName({ tag: " ", place: "Hillgrove, Riverton" })?.source).toBe("place");
  });
});

describe("needsName", () => {
  test("offered when nothing names the spot, or only its area does", () => {
    expect(needsName(null)).toBe(true);
    expect(needsName({ text: "Hillgrove, Riverton", source: "place" })).toBe(true);
    expect(needsName({ text: "VoltPoint, Lakeview Fuels", source: "invoice" })).toBe(false);
    expect(needsName({ text: "Maple Court", source: "tag" })).toBe(false);
  });
});

describe("withCarFlag", () => {
  test("the car's flag sits after the name, or stands alone", () => {
    expect(withCarFlag("Hillgrove, Riverton", "home")).toBe("Hillgrove, Riverton · Home");
    expect(withCarFlag(null, "favorite")).toBe("Favourite");
    expect(withCarFlag("Hillgrove, Riverton", null)).toBe("Hillgrove, Riverton");
    expect(withCarFlag("Home", "home")).toBe("Home");
    expect(withCarFlag(null, null)).toBeNull();
  });
});

describe("spotName", () => {
  const typed: UserPlace = { id: 7, name: "Maple Court", googlePlaceId: null, lat: 10, lng: 20, radiusM: 75 };
  const fromGoogle: UserPlace = { id: 8, name: null, googlePlaceId: "ChIJmadeUpOrchardMarket01", lat: 10, lng: 20, radiusM: 75 };

  test("a tag in range names the spot, above a station there", () => {
    const named = spotName([typed], { lat: 10.0002, lng: 20 }, { station: "Brightwell, Hillgrove", place: "Hillgrove, Riverton" });
    expect(named.name).toEqual({ text: "Maple Court", source: "tag" });
    expect(named.google).toBeNull();
    expect(named.target.tag).toEqual({ id: 7, name: "Maple Court", googlePlaceId: null });
  });

  test("a Google-tagged spot's name stays Google-free: the area, for pins and anything else", () => {
    const named = spotName([fromGoogle], { lat: 10.0002, lng: 20 }, { place: "Hillgrove, Riverton" });
    expect(named.name).toEqual({ text: "Hillgrove, Riverton", source: "place" });
    expect(named.google).toBeNull();
    expect(named.target.tag).toEqual({ id: 8, name: null, googlePlaceId: "ChIJmadeUpOrchardMarket01" });
    // A row shows the live name once filled in, credited; the area otherwise.
    expect(shownName(named)).toEqual({ text: "Hillgrove, Riverton", google: false });
    expect(shownName({ ...named, google: "Orchard Lane Market" })).toEqual({ text: "Orchard Lane Market", google: true });
  });

  test("a map pin never shows the Google name, even once it is filled in", () => {
    const named = { ...spotName([fromGoogle], { lat: 10.0002, lng: 20 }, { place: "Hillgrove, Riverton" }), google: "Orchard Lane Market" };
    expect(mapName(named)).toBe("Hillgrove, Riverton");
    // With nothing else naming the spot, the pin has no name at all.
    const bare = { ...spotName([fromGoogle], { lat: 10.0002, lng: 20 }), google: "Orchard Lane Market" };
    expect(mapName(bare)).toBeNull();
    // A typed name is the owner's own and shows on the map too.
    expect(mapName(spotName([typed], { lat: 10.0002, lng: 20 }, { place: "Hillgrove, Riverton" }))).toBe("Maple Court");
  });

  test("every tagged spot gets the pencil, Google's included; an area-only spot gets Name this place", () => {
    const at = { lat: 10.0002, lng: 20 };
    expect(nameAction(spotName([fromGoogle], at, { place: "Hillgrove, Riverton" }))).toBe("rename");
    expect(nameAction(spotName([typed], at))).toBe("rename");
    expect(nameAction(spotName([], at, { place: "Hillgrove, Riverton" }))).toBe("name");
    expect(nameAction(spotName([], at, { station: "Brightwell, Hillgrove" }))).toBeNull();
  });

  test("out of range, the other sources in their order", () => {
    const named = spotName([typed], { lat: 10.01, lng: 20 }, { place: "Hillgrove, Riverton" });
    expect(named.name).toEqual({ text: "Hillgrove, Riverton", source: "place" });
    expect(named.target.tag).toBeNull();
  });
});

describe("invoiceName", () => {
  test("the network alone without a station", () => {
    expect(invoiceName("ChargeZone", null)).toBe("ChargeZone");
  });
  test("a station that already names the network is not repeated", () => {
    expect(invoiceName("Statiq", "Statiq Hub, Hosur Road")).toBe("Statiq Hub");
  });
  test("a station alone when the network is blank", () => {
    expect(invoiceName("", "Lakeview Fuels, Hillgrove")).toBe("Lakeview Fuels");
  });
});

describe("chargeType", () => {
  test("the type line under a name", () => {
    expect(chargeType({ kind: "dc", supercharger: false })).toBe("Third-party charger");
    expect(chargeType({ kind: "dc", supercharger: true })).toBe("Supercharger");
    expect(chargeType({ kind: "ac", supercharger: false })).toBe("AC charging");
  });
});

describe("chargeSpot", () => {
  const start = Date.parse("2026-03-14T06:30:00Z");
  const at = (min: number) => new Date(start + min * 60_000).toISOString();
  test("the last reading within 10 minutes of the start", () => {
    const readings = [
      { at: at(-30), value: { latitude: 1, longitude: 1 } },
      { at: at(-5), value: { latitude: 10.1234, longitude: 76.5432 } },
      { at: at(4), value: { latitude: "10.1235", longitude: "76.5433" } },
    ];
    expect(chargeSpot(readings, start)).toEqual({ lat: 10.1235, lng: 76.5433 });
  });
  test("the last valid reading: a no-fix value after it doesn't hide it, and lat / lon shapes count", () => {
    const readings = [
      { at: at(-5), value: { latitude: 10.1234, longitude: 76.5432 } },
      { at: at(2), value: { lat: "10.1236", lon: "76.5434" } },
      { at: at(4), value: { latitude: 0, longitude: 0 } },
      { at: at(6), value: null },
    ];
    expect(chargeSpot(readings, start)).toEqual({ lat: 10.1236, lng: 76.5434 });
  });
  test("no reading near the start, no spot", () => {
    expect(chargeSpot([{ at: at(-30), value: { latitude: 10.2, longitude: 76.4 } }], start)).toBeNull();
  });
});

test("googleMapsUrl", () => {
  expect(googleMapsUrl({ lat: 10.1234, lng: 76.5432 })).toBe("https://www.google.com/maps/search/?api=1&query=10.123400,76.543200");
});

// A trip page's route line, above the page and apart from the map, by the trips list's rules: short names,
// "Around" a round trip, only when both ends are known; a picked Google place by its own name, credited.
describe("routeNames", () => {
  const spot = (text: string | null, google: string | null = null) => ({ name: text ? { text, source: "place" as const } : null, google });
  test("a Google-tagged end shows its Google name, credited, and the other end its own", () => {
    expect(routeNames(spot("Home"), spot("Anthiyur", "Eswaran Maligai Store"))).toEqual({
      from: { text: "Home", google: false },
      to: { text: "Eswaran Maligai Store", google: true },
    });
  });
  test("areas lose their city, as in the trips list; a Google name is kept whole", () => {
    expect(routeNames(spot("Koramangala, Bengaluru"), spot("Whitefield, Bengaluru", "Orchard Lane Market, Phase 2"))).toEqual({
      from: { text: "Koramangala", google: false },
      to: { text: "Orchard Lane Market, Phase 2", google: true },
    });
  });
  test("a trip that ends where it began is around that place", () => {
    expect(routeNames(spot("Home"), spot("Home"))).toEqual({ around: { text: "Home", google: false } });
  });
  test("no route while either end is unknown", () => {
    expect(routeNames(spot("Home"), spot(null))).toBeNull();
    expect(routeNames(null, spot("Anthiyur"))).toBeNull();
  });
});
