import { describe, expect, test } from "bun:test";
import { stationAt, stationLabel } from "@/lib/stations";

describe("stationAt", () => {
  test.each([
    ["Statiq in Aundh, Pune", 18.56389, 73.80705, "Statiq, Aundh"],
    ["Statiq in Chhattarpur, Delhi", 28.5133, 77.18607, "Statiq, Chhattarpur"],
    ["Magenta in Bengaluru", 12.91546, 77.61589, "Magenta Group, Kuvempu Nagar"],
  ] as const)("%s, from the extract", (_, lat, lon, label) => {
    expect(stationAt(lat, lon)).toBe(label);
  });

  test("a car parked about 50 m off the mapped point still matches", () => {
    expect(stationAt(18.56389 + 0.00045, 73.80705)).toBe("Statiq, Aundh");
  });

  test("about 300 m away is no station", () => {
    expect(stationAt(18.56389 + 0.0027, 73.80705)).toBeNull();
  });

  test("the nearest of two stations wins", () => {
    const stations: [string, string, string, number, number][] = [
      ["Far", "", "", 12.0, 77.001],
      ["Near", "", "", 12.0, 77.0003],
    ];
    expect(stationAt(12.0, 77.0, stations)).toBe("Near");
  });

  test("the sea, somewhere far away and bad input match nothing", () => {
    expect(stationAt(15, 65)).toBeNull(); // Arabian Sea
    expect(stationAt(51.5, -0.12)).toBeNull(); // London
    expect(stationAt(Number.NaN, 77)).toBeNull();
  });
});

describe("stationLabel", () => {
  test("operator and area, else the name, else the operator", () => {
    expect(stationLabel(["Some Mall Charger", "Statiq", "Koramangala", 0, 0])).toBe("Statiq, Koramangala");
    expect(stationLabel(["Some Mall Charger", "Statiq", "", 0, 0])).toBe("Some Mall Charger");
    expect(stationLabel(["", "Statiq", "", 0, 0])).toBe("Statiq");
    expect(stationLabel(["", "", "Koramangala", 0, 0])).toBeNull();
  });
});
