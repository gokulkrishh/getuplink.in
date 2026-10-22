import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  chainImport,
  cleanVersion,
  type HistoryEntry,
  parseDateTime,
  parseImport,
  parseTeslaMateJson,
  parseTyped,
  planImport,
  readSubmitted,
} from "@/lib/import-updates";

const NOW = Date.parse("2026-10-22T12:00:00Z");
const fixture = (name: string) => readFileSync(join(import.meta.dir, "fixtures", name), "utf8");
const pairs = (r: ReturnType<typeof parseImport>) => r.updates.map((u) => [u.version, u.at]);

describe("versions and dates", () => {
  test("strips the build hash and checks the shape", () => {
    expect(cleanVersion("2025.20.6 c41a7b9e02")).toBe("2025.20.6");
    expect(cleanVersion("2025.44.25.1")).toBe("2025.44.25.1");
    expect(cleanVersion("v2024.8.9")).toBe("2024.8.9");
    for (const bad of ["2025.20", "11.0.1", "2011.1.1", "2025.20.6.1.2", "0.0.0", "", null]) expect(cleanVersion(bad)).toBeNull();
  });

  test("reads ISO and TeslaFi's US dates in local time", () => {
    expect(parseDateTime("2025-06-25 07:10:00", 330)).toBe(Date.parse("2025-06-25T01:40:00Z"));
    expect(parseDateTime("6/25/2025 7:10:00 AM", 330)).toBe(Date.parse("2025-06-25T01:40:00Z"));
    expect(parseDateTime("6/25/2025 12:05:00 AM", 0)).toBe(Date.parse("2025-06-25T00:05:00Z"));
    expect(parseDateTime("2025-06-25T07:10:00+05:30", 0)).toBe(Date.parse("2025-06-25T01:40:00Z"));
    expect(parseDateTime("2025-06-25", 330)).toBe(Date.parse("2025-06-25T12:00:00Z"));
    expect(parseDateTime("2025-02-31", 0)).toBeNull();
    expect(parseDateTime("25/06/2025", 0)).toBeNull();
  });
});

describe("TeslaFi", () => {
  test("collapses per-minute rows into version changes", () => {
    const result = parseImport(fixture("teslafi-export.csv"), NOW);
    expect(result.error).toBeNull();
    expect(result.issues).toEqual([]);
    expect(result.updates.every((u) => u.format === "teslafi")).toBe(true);
    expect(pairs(result)).toEqual([
      ["2025.8.3", "2025-04-18T02:31:00.000Z"],
      ["2025.14.3", "2025-04-20T16:35:00.000Z"],
      ["2025.20.6", "2025-06-25T01:40:00.000Z"],
      ["2025.26.7", "2025-08-02T17:35:00.000Z"],
      ["2025.32.6", "2025-09-14T17:10:00.000Z"],
      ["2025.44.25.1", "2025-12-30T15:30:00.000Z"],
    ]);
  });

  test("needs Date and car_version columns", () => {
    expect(parseImport("Date,battery_level\n2025-01-01 10:00:00,80", NOW).error).toContain("Use a TeslaFi or TeslaMate export");
  });
});

describe("TeslaMate", () => {
  test("CSV: one update per finished install, at end_date in UTC", () => {
    const result = parseImport(fixture("teslamate-updates.csv"), NOW);
    expect(result.error).toBeNull();
    expect(result.updates.every((u) => u.format === "teslamate")).toBe(true);
    expect(pairs(result)).toEqual([
      ["2025.2.6", "2025-01-22T15:31:40.000Z"],
      ["2025.8.3", "2025-03-09T17:05:59.000Z"],
      ["2025.14.3", "2025-04-20T17:02:13.000Z"],
      ["2025.20.6", "2025-06-25T01:40:08.000Z"],
      ["2025.26.7", "2025-08-02T17:38:51.000Z"],
      ["2025.44.25.1", "2025-12-30T15:39:27.000Z"],
    ]);
  });

  test("JSON from TeslaMateApi or a bare array", () => {
    const api = JSON.stringify({
      data: {
        car: { car_id: 1, car_name: "Model Y" },
        updates: [
          { update_id: 2, start_date: "2025-06-25T06:42:45+05:30", end_date: "2025-06-25T07:10:08+05:30", version: "2025.20.6 c41a7b9e02" },
          { update_id: 1, start_date: "2025-04-20T22:05:20+05:30", end_date: "", version: "2025.14.3" },
        ],
      },
    });
    expect(pairs(parseImport(api, NOW))).toEqual([["2025.20.6", "2025-06-25T01:40:08.000Z"]]);
    expect(pairs(parseTeslaMateJson('[{"version":"2025.2.6","end_date":"2025-01-22 15:31:40"}]', NOW))).toEqual([
      ["2025.2.6", "2025-01-22T15:31:40.000Z"],
    ]);
    expect(parseTeslaMateJson("{nope", NOW).error).toBe("That JSON can't be read.");
  });
});

describe("typed list", () => {
  test("one version and date per line, with problems listed", () => {
    const result = parseTyped(
      ["2025.20.6 2025-06-25", "2025.14.3, 2025-04-20 22:05", "# a comment", "2025.20 2025-01-01", "2025.26.7 02/08/2025", "2027.2.1 2027-01-05", "2025.8.3 2011-12-31", "2025.20.6 2025-07-01"].join("\n"),
      NOW,
    );
    expect(pairs(result)).toEqual([
      ["2025.14.3", "2025-04-20T16:35:00.000Z"],
      ["2025.20.6", "2025-06-25T12:00:00.000Z"],
    ]);
    expect(result.issues).toEqual([
      'Line 4: "2025.20" isn\'t a version like 2025.20.6',
      "Line 5: 2025.26.7: the date needs to look like 2025-06-25",
      "Line 6: 2027.2.1: the date is in the future",
      "Line 7: 2025.8.3: the date is before 2012",
    ]);
  });

  test("nothing usable", () => {
    expect(parseTyped("hello", NOW).error).toBe("No updates found.");
  });
});

describe("checking against the history", () => {
  const history: HistoryEntry[] = [
    { id: 10, version: "2025.2.6", previous_version: null, detected_at: "2025-01-22T15:31:40.000Z", source: "imported" },
    { id: 11, version: "2025.44.25.1", previous_version: null, detected_at: "2025-12-31T10:00:00.000Z", source: "tracked" },
    { id: 12, version: "2026.2.9", previous_version: "2025.44.25.1", detected_at: "2026-02-12T10:00:00.000Z", source: "tracked" },
  ];
  const updates = parseImport(fixture("teslamate-updates.csv"), NOW).updates;

  test("flags versions already there and anything after tracking began", () => {
    const plan = planImport([...updates, { version: "2026.8.3", at: "2026-03-01T00:00:00.000Z", format: "typed" }], history);
    expect(plan.map((r) => [r.version, r.status])).toEqual([
      ["2025.2.6", "duplicate"],
      ["2025.8.3", "new"],
      ["2025.14.3", "new"],
      ["2025.20.6", "new"],
      ["2025.26.7", "new"],
      ["2025.44.25.1", "duplicate"],
      ["2026.8.3", "newer"],
    ]);
  });

  test("chains imported rows without touching tracked ones", () => {
    const plan = planImport(
      [
        { version: "2024.44.25", at: "2024-12-01T12:00:00.000Z", format: "typed" },
        { version: "2025.8.3", at: "2025-03-09T17:05:59.000Z", format: "typed" },
        { version: "2025.14.3", at: "2025-03-09T17:05:59.000Z", format: "typed" },
      ],
      history,
    );
    const { inserts, updates: changed } = chainImport(plan, history);
    expect(inserts).toEqual([
      { version: "2024.44.25", previous_version: null, detected_at: "2024-12-01T12:00:00.000Z" },
      { version: "2025.8.3", previous_version: "2025.2.6", detected_at: "2025-03-09T17:05:59.000Z" },
      // Same time as the row before it, so it moves on a second.
      { version: "2025.14.3", previous_version: "2025.8.3", detected_at: "2025-03-09T17:06:00.000Z" },
    ]);
    expect(changed).toEqual([{ id: 10, previous_version: "2024.44.25" }]);
  });

  test("with nothing tracked yet, every row counts as newer", () => {
    expect(planImport(updates, []).every((r) => r.status === "newer")).toBe(true);
  });

  test("rows sent back for saving are checked again", () => {
    expect(readSubmitted([{ version: "2025.20.6", at: "2025-06-25T01:40:08.000Z", format: "teslamate" }], NOW)).toEqual([
      { version: "2025.20.6", at: "2025-06-25T01:40:08.000Z", format: "teslamate" },
    ]);
    expect(readSubmitted([{ version: "drop table", at: "2025-06-25T01:40:08.000Z", format: "typed" }], NOW)).toBeNull();
    expect(readSubmitted([{ version: "2025.20.6", at: "2030-01-01T00:00:00.000Z", format: "typed" }], NOW)).toBeNull();
    expect(readSubmitted([{ version: "2025.20.6", at: "2025-06-25T01:40:08.000Z", format: "csv" }], NOW)).toBeNull();
    expect(readSubmitted("nope", NOW)).toBeNull();
  });
});
