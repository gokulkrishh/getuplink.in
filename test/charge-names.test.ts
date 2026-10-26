import { describe, expect, test } from "bun:test";
import { chargeName, chargeSpot, chargeType, googleMapsUrl, invoiceName } from "@/lib/charge-names";

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
