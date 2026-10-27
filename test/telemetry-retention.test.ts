import { describe, expect, test } from "bun:test";
import { PRESENCE_FIELDS } from "@/lib/awake";
import { CAR_NOW_FIELDS, TYRE_SEEN_FIELDS } from "@/lib/car-now";
import { CHARGE_FIELDS } from "@/lib/charge-sessions";
import { DRIVE_DAYS } from "@/lib/drives";
import { DEFAULT_KEEP_DAYS, keepDays, KEPT_UNREAD, NEAR_CHARGE_FIELDS, NEAR_CHARGE_MINUTES, READS, retentionRules, withMargin } from "@/lib/telemetry-retention";
import { UPDATE_FIELDS } from "@/lib/telemetry";

describe("keepDays", () => {
  test("every read keeps its field at least as long as its window, with a margin", () => {
    for (const read of READS)
      for (const field of read.fields) {
        const keep = keepDays(field);
        if (read.window === "forever") expect(keep).toBeNull();
        else if (keep !== null) expect(keep).toBeGreaterThanOrEqual(withMargin(read.window));
      }
  });
  test("lifetime counters and charge session fields are kept forever", () => {
    for (const field of ["Odometer", "LifetimeEnergyUsed", "LifetimeEnergyGainedRegen", ...CHARGE_FIELDS, "ModuleTempMin"]) expect(keepDays(field)).toBeNull();
    for (const field of KEPT_UNREAD) expect(keepDays(field)).toBeNull();
  });
  test("software update fields are kept forever, for the version timelines", () => {
    for (const field of ["Version", "SoftwareUpdateVersion", "SoftwareUpdateDownloadPercentComplete", "SoftwareUpdateInstallationPercentComplete", "SoftwareUpdateInProgress"])
      expect(keepDays(field)).toBeNull();
  });
  test("drive fields last the drive window plus a margin", () => {
    expect(withMargin(DRIVE_DAYS)).toBe(120);
    for (const field of ["Location", "VehicleSpeed", "LongitudinalAcceleration", "PackVoltage", "PackCurrent", "GradeEstimatePercent", "Gear", "RatedRange", "OutsideTemp", "LocatedAtHome", "HvacPower", "HvacACEnabled", "HvacLeftTemperatureRequest", "HvacRightTemperatureRequest", "InsideTemp"])
      expect(keepDays(field)).toBe(120);
  });
  test("every field the online strips read is kept past their 15 days", () => {
    expect(READS.find((r) => r.by === "loadPresence")?.fields).toEqual(PRESENCE_FIELDS);
    for (const field of ["Soc", "IsolationResistance"]) expect(keepDays(field)).toBe(withMargin(15));
  });
  test("the tyres' measured times are kept past the two weeks their first arrivals are read over", () => {
    for (const field of TYRE_SEEN_FIELDS) expect(keepDays(field)).toBe(withMargin(14));
  });
  test("Tesla's full-pack figure is read and kept forever", () => {
    expect(READS.some((r) => r.fields.includes("NominalFullPackEnergyKwh"))).toBe(true);
    expect(keepDays("NominalFullPackEnergyKwh")).toBeNull();
  });
  test("the week of cell voltages is kept two weeks", () => {
    for (const field of ["BrickVoltageMax", "BrickVoltageMin"]) expect(keepDays(field)).toBe(14);
  });
  test("fields nothing reads, or only reads the latest of, get the default", () => {
    for (const field of ["LateralAcceleration", "PedalPosition", "BrakePedal", "DiTorqueActualR", "GpsHeading", "SomeNewField"]) expect(keepDays(field)).toBe(DEFAULT_KEEP_DAYS);
    // The newest row of each field is always kept (in SQL), so the latest-value readers need nothing more.
    for (const field of CAR_NOW_FIELDS.filter((f) => !["InsideTemp", "OutsideTemp", "HvacPower", "HvacACEnabled", "HvacLeftTemperatureRequest", "HvacRightTemperatureRequest", ...TYRE_SEEN_FIELDS].includes(f))) expect(keepDays(field)).toBe(DEFAULT_KEEP_DAYS);
    for (const field of UPDATE_FIELDS) expect(keepDays(field) === null || keepDays(field)! >= DEFAULT_KEEP_DAYS).toBe(true);
  });
});

describe("withMargin", () => {
  test("a third more, at least a week", () => {
    expect(withMargin(7)).toBe(14);
    expect(withMargin(15)).toBe(22);
    expect(withMargin(30)).toBe(40);
    expect(withMargin(90)).toBe(120);
  });
});

describe("retentionRules", () => {
  const rules = retentionRules();
  test("one entry per field, sorted, with a keep each", () => {
    expect(new Set(rules.fields).size).toBe(rules.fields.length);
    expect([...rules.fields].sort()).toEqual(rules.fields);
    expect(rules.keepDays.length).toBe(rules.fields.length);
    rules.fields.forEach((field, k) => expect(rules.keepDays[k]).toBe(keepDays(field)));
  });
  test("never a keep under a day, which the SQL function refuses", () => {
    for (const days of rules.keepDays) if (days !== null) expect(days).toBeGreaterThanOrEqual(1);
    expect(rules.defaultDays).toBeGreaterThanOrEqual(1);
  });
  test("Location near charges outlives the charging pins' 10 minutes", () => {
    expect(rules.nearChargeFields).toEqual(NEAR_CHARGE_FIELDS);
    expect(rules.nearChargeFields).toContain("Location");
    expect(rules.nearChargeMinutes).toBe(NEAR_CHARGE_MINUTES);
    expect(NEAR_CHARGE_MINUTES).toBeGreaterThan(10);
  });
  test("no Media field has a rule: they're no longer collected", () => {
    expect(rules.fields.some((f) => f.startsWith("Media"))).toBe(false);
  });
});
