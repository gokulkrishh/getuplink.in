import { PRESENCE_FIELDS } from "@/lib/awake";
import { TYRE_SEEN_FIELDS } from "@/lib/car-now";
import { CHARGE_FIELDS } from "@/lib/charge-sessions";
import { DRIVE_DAYS } from "@/lib/drives";

// How long telemetry_readings keeps each field. Pure, so it can be tested; lib/server/retention.ts passes
// these rules to public.prune_telemetry_readings (supabase/migrations/20261029130000_telemetry_retention.sql)
// once a day from app/api/cron/retention.
//
// Three rules hold for every field, whatever the table below says:
//   1. Each car's newest reading of a field is never deleted. Fields arrive only when they change, and
//      the car page, home page and charge rebuild read "the latest value", which can be months old.
//   2. Location within NEAR_CHARGE_MINUTES of a charge session's start is kept as long as the session:
//      the charging map pins each charge, of any age, from the Location 10 min either side of its start.
//   3. A field nothing reads goes after DEFAULT_KEEP_DAYS.
//
// Drives outlive their readings: each night, before this runs, app/api/cron/archive stores every finished
// drive with a slimmed copy of its readings (lib/drive-archive.ts), and loadReadingsByField reads that copy
// for a window older than the readings kept. So the DRIVE_DAYS rows below only bound the full readings.
//
// Where each field is read, and over how long. Change this table with the reader, or retention deletes
// what a page needs. "latest" reads only need rule 1.
//
//   Reader (file)                                       Fields                                            Window
//   counter_values_at (driving.ts, home.ts)             Odometer, LifetimeEnergyUsed,                     forever: the first reading
//                                                       LifetimeEnergyGainedRegen                         ever, and any month boundary
//   syncStreamSessions (stream-charging.ts)             CHARGE_FIELDS                                     forever: since the last
//                                                                                                         session, which can be old
//   loadChargeDetail (charge-curve.ts)                  AC/DCChargingPower, BatteryLevel,                 forever: any session, by id
//                                                       ModuleTempMin, ModuleTempMax
//   loadChargingExtras (charging-extra.ts)              DCChargingPower, BatteryLevel                     forever: last 8 DC charges,
//                                                                                                         or any picked range
//   loadChargingExtras pins (charging-extra.ts)         Location                                          ±10 min of any session start
//   loadChargeDetail spot (charge-curve.ts)             Location                                          ±10 min of the session start
//   loadLastCharge (car.ts)                             ACChargingPower                                   forever: the last AC charge
//   withTimelines (dashboard.ts)                        Version, SoftwareUpdateVersion,                   forever: oldest version in
//                                                       SoftwareUpdateDownload/InstallationPercent-       history, minus 14 days
//                                                       Complete, SoftwareUpdateInProgress
//   syncStreamVersions (stream-versions.ts)             Version; SoftwareUpdateVersion; Odometer          since the last version found;
//                                                                                                         14 d before it; ±1 d
//   loadWindowStats (driving.ts)                        Gear, Odometer, BatteryLevel, EnergyRemaining,    DRIVE_DAYS (90); the 12-week
//                                                       LifetimeEnergyUsed, RatedRange,                   battery trend fits inside
//                                                       DetailedChargeState
//   loadDriveDetail (drive-detail.ts)                   BatteryLevel, RatedRange, VehicleSpeed,           drives in DRIVE_DAYS
//                                                       OutsideTemp, Location, LongitudinalAcceleration,
//                                                       PackVoltage, PackCurrent, GradeEstimatePercent,
//                                                       HvacPower, HvacACEnabled, InsideTemp,
//                                                       HvacLeft/RightTemperatureRequest
//   loadDay (day.ts)                                    Location                                          days in DRIVE_DAYS
//   loadParkedPlaces (parked-places.ts)                 Location                                          ±10 min of each stretch's
//                                                                                                         start, 30 d of stretches
//   loadDrivingExtras (driving-extra.ts)                VehicleSpeed, OutsideTemp, Location,              30 d, or a picked range
//                                                       LocatedAtHome, LocatedAtWork, LocatedAtFavorite   clipped to DRIVE_DAYS
//   chargeLevel (charge-level.ts)                       BatteryLevel, DetailedChargeState                 30 d (LEVEL_DAYS)
//   loadPresence (awake.ts)                             PRESENCE_FIELDS: EnergyRemaining, Soc,            15 d (AWAKE_DAYS + 1)
//                                                       IsolationResistance, LifetimeEnergyUsed,
//                                                       SoftwareUpdateDownloadPercentComplete
//   loadLatestWeekPack (car.ts)                         EnergyRemaining, BatteryLevel                     this IST week and last
//   loadBatteryExtras (battery-extra.ts)                ModuleTempMax, InsideTemp, OutsideTemp,           7 d (TEMP_DAYS)
//                                                       BrickVoltageMax, BrickVoltageMin;                 12 weeks
//                                                       NominalFullPackEnergyKwh (also its latest)
//   syncChargingCars (station-check.ts)                 charging fields                                   45 min
//   loadTyreArrivals (telemetry-window.ts)              TpmsLastSeenPressureTime*                         14 d (TYRE_ARRIVAL_DAYS)
//   loadStream (telemetry.ts; car, home, updates)       STREAM_FIELDS, CAR_NOW_FIELDS, UPDATE_FIELDS      latest
//   baselineBefore (stream-charging.ts)                 BatteryLevel, EnergyRemaining, FastCharger*,      latest before a time
//                                                       ChargingCableType, ModuleTempMax
//   lastReadingAt (telemetry.ts)                        any                                               latest

export const DEFAULT_KEEP_DAYS = 7;
export const NEAR_CHARGE_MINUTES = 15; // the pins read 10 min either side
export const NEAR_CHARGE_FIELDS = ["Location"];

export type Window = number | "forever";

// The table above, as data. Days are the longest window the reader looks back over.
export const READS: { by: string; fields: readonly string[]; window: Window }[] = [
  { by: "counter_values_at", fields: ["Odometer", "LifetimeEnergyUsed", "LifetimeEnergyGainedRegen"], window: "forever" },
  { by: "syncStreamSessions", fields: CHARGE_FIELDS, window: "forever" },
  { by: "loadChargeDetail", fields: ["ACChargingPower", "DCChargingPower", "BatteryLevel", "ModuleTempMin", "ModuleTempMax"], window: "forever" },
  { by: "withTimelines", fields: ["Version", "SoftwareUpdateVersion", "SoftwareUpdateDownloadPercentComplete", "SoftwareUpdateInstallationPercentComplete", "SoftwareUpdateInProgress"], window: "forever" },
  { by: "loadWindowStats", fields: ["Gear", "Odometer", "BatteryLevel", "EnergyRemaining", "LifetimeEnergyUsed", "RatedRange", "DetailedChargeState"], window: DRIVE_DAYS },
  {
    by: "loadDriveDetail",
    fields: ["BatteryLevel", "RatedRange", "VehicleSpeed", "OutsideTemp", "Location", "LongitudinalAcceleration", "PackVoltage", "PackCurrent", "GradeEstimatePercent", "HvacPower", "HvacACEnabled", "HvacLeftTemperatureRequest", "HvacRightTemperatureRequest", "InsideTemp"],
    window: DRIVE_DAYS,
  },
  { by: "loadDay", fields: ["Location"], window: DRIVE_DAYS },
  { by: "loadParkedPlaces", fields: ["Location"], window: 30 },
  { by: "loadDrivingExtras", fields: ["VehicleSpeed", "OutsideTemp", "Location", "LocatedAtHome", "LocatedAtWork", "LocatedAtFavorite", "HvacPower", "HvacACEnabled", "HvacLeftTemperatureRequest", "HvacRightTemperatureRequest"], window: DRIVE_DAYS },
  { by: "chargeLevel", fields: ["BatteryLevel", "DetailedChargeState"], window: 30 },
  { by: "loadPresence", fields: PRESENCE_FIELDS, window: 15 },
  { by: "loadTyreArrivals", fields: TYRE_SEEN_FIELDS, window: 14 },
  { by: "loadLatestWeekPack", fields: ["EnergyRemaining", "BatteryLevel"], window: 14 },
  { by: "loadBatteryExtras", fields: ["ModuleTempMax", "InsideTemp", "OutsideTemp", "BrickVoltageMax", "BrickVoltageMin"], window: 7 },
  { by: "loadBatteryExtras", fields: ["NominalFullPackEnergyKwh"], window: 12 * 7 },
  { by: "syncStreamVersions", fields: ["SoftwareUpdateVersion"], window: 14 },
];

// Kept forever, whether read or not (NominalFullPackEnergyKwh is read over 12 weeks): lifetime counters and
// pack figures only make sense with their whole history, and they change at most every 5 minutes, so they
// cost little.
export const KEPT_UNREAD = [
  "LifetimeEnergyUsedDrive",
  "LifetimeEnergyChargedKwh",
  "NominalFullPackEnergyKwh",
  "MilesSinceReset",
  "SelfDrivingMilesSinceReset",
];

// A read window plus a margin, so a page at the edge of its window, or a reader whose window grows a
// little, still finds its rows: a third more, at least a week (90 days are kept 120, 7 days 14).
export const withMargin = (days: number) => days + Math.max(7, Math.ceil(days / 3));

// Days to keep a field, or null to keep it forever.
export function keepDays(field: string): number | null {
  if (KEPT_UNREAD.includes(field)) return null;
  let keep = DEFAULT_KEEP_DAYS;
  for (const read of READS) {
    if (!read.fields.includes(field)) continue;
    if (read.window === "forever") return null;
    keep = Math.max(keep, withMargin(read.window));
  }
  return keep;
}

export type RetentionRules = {
  fields: string[];
  keepDays: (number | null)[]; // null: forever
  defaultDays: number; // every field not listed
  nearChargeFields: string[];
  nearChargeMinutes: number;
};

// The rules for every field anything reads, one entry each, in name order.
export function retentionRules(): RetentionRules {
  const fields = [...new Set([...READS.flatMap((r) => r.fields), ...KEPT_UNREAD])].sort();
  return {
    fields,
    keepDays: fields.map(keepDays),
    defaultDays: DEFAULT_KEEP_DAYS,
    nearChargeFields: NEAR_CHARGE_FIELDS,
    nearChargeMinutes: NEAR_CHARGE_MINUTES,
  };
}
