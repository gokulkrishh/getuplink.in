import { describe, expect, test } from "bun:test";
import { chargeName, chargeSpot, chargeType, googleMapsUrl, invoiceName, needsName, spotName, withCarFlag } from "@/lib/charge-names";
import type { UserPlace } from "@/lib/user-places";

describe("chargeName", () => {
  const invoice = { network: "VoltPoint", station: "Lakeview Fuels, Ring Road, Hillgrove" };

  test("a station OpenStreetMap doesn't know is named from its invoice", () => {
    expect(chargeName({ station: null, invoice, place: "Hillgrove, Riverton" })).toEqual({ text: "VoltPoint, Lakeview Fuels", source: "invoice" });
  });

  test("the station check's match comes first", () => {
    expect(chargeName({ station: "Magenta ChargeGrid, BTM Layout", invoice, site: "Bengaluru, Orion Mall", place: "BTM Layout, Bengaluru" })).toEqual({
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
  const typed: UserPlace = { id: 7, name: "Maple Court", lat: 10, lng: 20, radiusM: 75 };

  test("a tag in range names the spot, above a station there", () => {
    const named = spotName([typed], { lat: 10.0002, lng: 20 }, { station: "Brightwell, Hillgrove", place: "Hillgrove, Riverton" });
    expect(named.name).toEqual({ text: "Maple Court", source: "tag" });
    expect(named.target.tag).toEqual({ id: 7, name: "Maple Court" });
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
  test("no reading near the start, no spot", () => {
    expect(chargeSpot([{ at: at(-30), value: { latitude: 10.2, longitude: 76.4 } }], start)).toBeNull();
  });
});

test("googleMapsUrl", () => {
  expect(googleMapsUrl({ lat: 10.1234, lng: 76.5432 })).toBe("https://www.google.com/maps/search/?api=1&query=10.123400,76.543200");
});
