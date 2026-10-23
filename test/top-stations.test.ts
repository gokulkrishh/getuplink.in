import { describe, expect, test } from "bun:test";
import { topStations } from "@/lib/top-stations";

describe("topStations", () => {
  test("groups by name, most energy first, spend from bills only, unnamed left out", () => {
    const rows = topStations([
      { name: "Bengaluru, Nexus Koramangala", kwh: 40, cost: 920 },
      { name: "ChargeMOD, Kochi", kwh: 18, cost: null },
      { name: "Bengaluru, Nexus Koramangala", kwh: 35, cost: 800 },
      { name: null, kwh: 50, cost: null },
    ]);
    expect(rows.map((r) => [r.name, r.charges, r.kwh, r.spend, r.billed])).toEqual([
      ["Bengaluru, Nexus Koramangala", 2, 75, 1720, 2],
      ["ChargeMOD, Kochi", 1, 18, 0, 0],
    ]);
  });
});
