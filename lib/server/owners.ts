import "server-only";
import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { MILES_TO_KM } from "@/lib/car";
import { DEMO } from "@/lib/demo";
import { buildDrives, DRAIN_DAYS, type DriveInputs, parkedDrain } from "@/lib/drives";
import { messageOf } from "@/lib/errors";
import {
  aggregate,
  type CarDay,
  type CarSummary,
  comparisons,
  type DayFigures,
  FIGURES_VERSION,
  KEEP_DAYS,
  type Latest,
  MIN_CARS,
  type OwnerStats,
  segmentOf,
  SETTING_FIELDS,
  STATS_VERSION,
  summarise,
  WINDOW_DAYS,
} from "@/lib/owners";
import { type Counters, dayFigures, installsIn, SLOWING_MS2 } from "@/lib/owners-day";
import { stateTotals } from "@/lib/rollout-states";
import { istDay, istDayStart, num, type Reading } from "@/lib/telemetry-derive";
import { keepDays } from "@/lib/telemetry-retention";
import { loadCarDetails } from "./car";
import { type Owner, ownerDb } from "./data/owner";
import {
  latestOwnerStats,
  pruneOwnerStats,
  pruneSharedDays,
  saveOwnerStats,
  setSharingFlag,
  sharedCarDays,
  type Sharing,
  sharingOf,
  sharingOwners,
} from "./data/owners";
import { MissingSchema } from "./data/usage";
import { demoData, demoReadings } from "./demo";
import { demoOwnerSummaries } from "./demo/owners";
import { loadCounters } from "./energy";
import { env } from "./env";
import { carStates } from "./home-state";
import { readStreamSessions } from "./stream-charging";
import { loadStream, readingsBefore } from "./telemetry";
import { firstReadingAt, loadReadingsByField, loadSlowingAccel } from "./telemetry-window";

// The Owners page's figures: each shared car's day rows (fleet_car_days), worked out once a day by
// app/api/cron/owners from the car's readings with lib/owners-day.ts, and the totals across every shared
// car (fleet_stats) that /owners reads. Only totals leave here; an owner's own summary goes only to them.

const HOUR = 3_600_000;
const DAY = 86_400_000;
// A day is worked out once it has ended and a drive running past midnight has ended too. The run is at
// 3:30 AM IST, so yesterday is ready.
export const SETTLE_MS = 3 * HOUR;
// Readings from this long before a day, so the drive or stop it begins in is whole.
const LEAD_MS = 2 * DAY;
// An install's offer is looked for this far back, like the update timings (lib/server/stream-versions.ts).
const OFFER_LEAD_MS = 14 * DAY;
// The run stops starting days after this; the totals and the prune still run (the route has 300 s).
const BUDGET_MS = 240_000;

// Read once per car for all its days: each changes every few minutes at most.
const DRIVE_FIELDS = ["Gear", "Odometer", "BatteryLevel", "EnergyRemaining", "LifetimeEnergyUsed", "RatedRange", "DetailedChargeState"];
const CLIMATE_FIELDS = ["HvacPower", "HvacACEnabled", "HvacLeftTemperatureRequest", "HvacRightTemperatureRequest"];
const SEAT = "ClimateSeatCoolingFrontLeft";
const MODE_FIELDS = ["SentryMode", "ClimateKeeperMode"];
const WINDOW_FIELDS = [...DRIVE_FIELDS, ...CLIMATE_FIELDS, SEAT, ...MODE_FIELDS];
// Sent only when they change: the value in force when the readings start is read too.
const HELD_FIELDS = ["Gear", "DetailedChargeState", ...CLIMATE_FIELDS, SEAT, ...MODE_FIELDS];
// A reading a second while driving, so read a day at a time.
const SPEED = "VehicleSpeed";
const BRAKE = "BrakePedal";
const ACCEL = "LongitudinalAcceleration";
const COUNTERS = ["LifetimeEnergyGainedRegen", "LifetimeEnergyUsedDrive"];
const LATEST_FIELDS = [...SETTING_FIELDS, "ChargeLimitSoc", "TpmsPressureFl", "TpmsPressureFr", "TpmsPressureRl", "TpmsPressureRr"];

const iso = (t: number) => new Date(t).toISOString();
// An IST day number as the table's date, and back: day n starts at UTC midnight of that date, minus 5:30.
export const dateOf = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);
export const dayOf = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / DAY);

// Whether a field's readings for the day are all still kept: one kept a week (keepDays) has lost the
// start of a day older than that. Its figures are then null, never 0 (lib/owners.ts DayFigures).
export function keptOn(field: string, day: number, now: number): boolean {
  const keep = keepDays(field);
  return keep === null || istDayStart(day) >= now - keep * DAY;
}

// The VIN keyed with a server secret: a car two accounts share counts once, and the stored key can't be
// turned back into a VIN.
export function vinHash(vin: string): string {
  return createHmac("sha256", Buffer.from(env("TOKEN_ENCRYPTION_KEY"), "base64")).update(`owners:${vin.toUpperCase()}`).digest("hex");
}

export type SharedCar = { id: string; vin: string; since: number };

// The owner's cars that are still theirs, with when Uplink began tracking each: no day before that is
// worked out, since an empty day would read as a day without driving.
async function sharedCars(owner: Owner): Promise<SharedCar[]> {
  if (DEMO) return [{ id: demoData().vehicle.id, vin: demoData().vin, since: 0 }];
  const { data, error } = await ownerDb(owner)
    .from("vehicles")
    .select("id:id::text, vin, created_at, readings_from")
    .not("vin", "is", null)
    .is("readings_until", null)
    .order("created_at");
  if (error) throw new Error(`Reading cars failed: ${error.message}`);
  return (data ?? []).map((c) => ({
    id: c.id as string,
    vin: c.vin as string,
    since: Math.max(Date.parse(c.created_at as string) || 0, Date.parse(c.readings_from as string) || 0),
  }));
}

// Each field's last reading before `at`, as a list to put in front of the window's own.
async function heldBefore(owner: Owner, vin: string, fields: string[], at: string): Promise<Record<string, Reading[]>> {
  if (DEMO) {
    return Object.fromEntries(fields.map((f) => [f, demoReadings(f, "1970-01-01T00:00:00.000Z", at).slice(-1)]));
  }
  try {
    const stream = await readingsBefore(owner, vin, fields, at);
    return Object.fromEntries(fields.map((f) => [f, stream[f] ? [{ at: stream[f].at, value: stream[f].value }] : []]));
  } catch (err) {
    console.warn("Readings before the window unavailable:", messageOf(err));
    return Object.fromEntries(fields.map((f) => [f, []]));
  }
}

// The car now: what it is (the car page's details) and its latest settings.
async function loadLatest(owner: Owner, car: SharedCar): Promise<Latest> {
  const [stream, details] = await Promise.all([
    loadStream(owner, car.vin, LATEST_FIELDS),
    loadCarDetails(owner, car.id).catch((err) => {
      console.warn("Car details unavailable:", messageOf(err));
      return null;
    }),
  ]);
  const pressure = (a: string, b: string) => {
    const both = [num(stream[a]?.value), num(stream[b]?.value)].filter((v): v is number => v !== null && v > 0);
    return both.length ? both.reduce((x, y) => x + y, 0) / both.length : null;
  };
  return {
    model: details?.model ?? null,
    pack: details?.pack ?? null,
    drive: details?.drive ?? null,
    lfp: details?.likelyLfp ?? false,
    paint: details?.paint ?? null,
    // "19″ Crossflow · aero covers": the wheel itself.
    wheels: details?.wheels?.split(" · ")[0] ?? null,
    capacityKwh: details?.battery?.kwh ?? null,
    tyreFrontBar: pressure("TpmsPressureFl", "TpmsPressureFr"),
    tyreRearBar: pressure("TpmsPressureRl", "TpmsPressureRr"),
    chargeLimit: num(stream.ChargeLimitSoc?.value),
    settings: Object.fromEntries(SETTING_FIELDS.flatMap((f) => (stream[f] ? [[f, stream[f].value]] : []))),
  };
}

// Days `days` of one car (IST day numbers), worked out from its readings: the slower fields read once for
// all of them, the ones sent every second a day at a time. Idempotent: the same readings give the same
// figures. `stop` is asked before each day; the days not reached are left out, and so is a day with a charge
// still going, so it isn't stored part-done. Both stay due. A failed read of the charges throws, so no day is
// stored without its charges.
export async function computeCarDays(owner: Owner, car: SharedCar, days: number[], now: number, stop: () => boolean = () => false): Promise<CarDay[]> {
  if (days.length === 0) return [];
  const sorted = [...days].sort((a, b) => a - b);
  const first = istDayStart(sorted[0]);
  const from = iso(first - LEAD_MS);
  const to = iso(Math.min(istDayStart(sorted[sorted.length - 1] + 1) + SETTLE_MS, now));
  const versionsFrom = iso(first - OFFER_LEAD_MS);
  const edges = [...new Set(sorted.flatMap((d) => [istDayStart(d), istDayStart(d + 1)]))];
  const [window, versions, held, versionBefore, counters, sessions, latest, accelSince] = await Promise.all([
    loadReadingsByField(owner, car.vin, WINDOW_FIELDS, from, to),
    loadReadingsByField(owner, car.vin, ["Version", "SoftwareUpdateVersion"], versionsFrom, to),
    heldBefore(owner, car.vin, HELD_FIELDS, from),
    heldBefore(owner, car.vin, ["Version"], versionsFrom),
    loadCounters(owner, car.vin, COUNTERS, edges.map(iso)),
    readStreamSessions(owner),
    loadLatest(owner, car),
    firstReadingAt(owner, car.vin, ACCEL),
  ]);
  if (!window || !versions) throw new Error("The car's readings are unavailable");
  // A car that sent nothing in the whole window has no days to show, not days of no driving.
  if (WINDOW_FIELDS.every((f) => window[f].length === 0)) return [];
  const r = (field: string) => [...(held[field] ?? []), ...window[field]];
  const input: DriveInputs = {
    gear: r("Gear"),
    odometer: window.Odometer,
    battery: window.BatteryLevel,
    energy: window.EnergyRemaining,
    lifetime: window.LifetimeEnergyUsed,
    range: window.RatedRange,
    charge: r("DetailedChargeState"),
  };
  const drives = buildDrives(input);
  // Stretches of 6 hours or more, as the Parked page has them, from the first day on.
  const parked = parkedDrain(input, first + DRAIN_DAYS * DAY);
  const times = WINDOW_FIELDS.flatMap((f) => window[f].map((x) => Date.parse(x.at))).sort((a, b) => a - b);
  const climate = { power: r("HvacPower"), ac: r("HvacACEnabled"), left: r("HvacLeftTemperatureRequest"), right: r("HvacRightTemperatureRequest"), inside: [], outside: [] };
  const carSessions = sessions.filter((s) => s.vin === car.vin);
  const counter = (at: number): Counters => {
    const k = edges.indexOf(at);
    return { gained: counters?.get(COUNTERS[0])?.bounds[k]?.value ?? null, used: counters?.get(COUNTERS[1])?.bounds[k]?.value ?? null };
  };
  const versionStart = versionBefore.Version[0]?.value;

  const out: CarDay[] = [];
  for (const day of sorted) {
    if (stop()) break;
    if (carSessions.some((s) => s.ended_at === null && istDay(Date.parse(s.started_at)) === day)) continue;
    const start = istDayStart(day);
    const dayFrom = iso(start);
    const dayTo = iso(Math.min(start + DAY + SETTLE_MS, now));
    const brakeKept = keptOn(BRAKE, day, now);
    const [fine, accel, brakeBefore] = await Promise.all([
      loadReadingsByField(owner, car.vin, brakeKept ? [SPEED, BRAKE] : [SPEED], dayFrom, dayTo),
      accelSince !== null && accelSince < start + DAY ? loadSlowingAccel(owner, car.vin, SLOWING_MS2, dayFrom, dayTo) : null,
      brakeKept ? heldBefore(owner, car.vin, [BRAKE], dayFrom) : null,
    ]);
    const brake = brakeKept && fine ? [...(brakeBefore?.[BRAKE] ?? []), ...fine[BRAKE]] : [];
    // A field sent only when it changes is known for the day only from a reading at or before its start. The
    // one that set it may be gone (retention keeps a week, then only each field's newest), and then the day's
    // figure is unknown, not off.
    const kept = (field: string) => keptOn(field, day, now) && r(field).some((x) => Date.parse(x.at) <= start);
    const figures: DayFigures = dayFigures({
      day,
      drives,
      parked,
      times,
      sessions: carSessions,
      accel: accel ? accel.flatMap((x) => (num(x.value) === null ? [] : [{ t: Date.parse(x.at), v: num(x.value)! }])) : null,
      brake: brake.length ? brake : null,
      speed: fine ? fine[SPEED].flatMap((x) => (num(x.value) === null ? [] : [{ t: Date.parse(x.at), v: num(x.value)! * MILES_TO_KM }])) : null,
      climate,
      seat: kept(SEAT) ? r(SEAT) : null,
      modes: MODE_FIELDS.every(kept) ? { SentryMode: r("SentryMode"), ClimateKeeperMode: r("ClimateKeeperMode") } : null,
      counters: { start: counter(start), end: counter(start + DAY) },
      installs: installsIn(day, versions.Version, versions.SoftwareUpdateVersion, typeof versionStart === "string" ? versionStart : null),
      latest,
    });
    out.push({ day, figures });
  }
  return out;
}

export async function computeCarDay(owner: Owner, car: SharedCar, day: number, now: number): Promise<CarDay | null> {
  return (await computeCarDays(owner, car, [day], now))[0] ?? null;
}

type DayRow = { vehicle_id: string; day: string; computed_at: string; figures: { v?: unknown } | null };

// The window's complete days a car still needs: no row yet, or one worked out by an older method or before
// the day had settled. None before Uplink tracked the car. Oldest first.
export function dueDays(rows: DayRow[], since: number, now: number): number[] {
  const done = new Map(rows.map((row) => [dayOf(row.day), row]));
  const today = istDay(now);
  const due: number[] = [];
  for (let day = today - WINDOW_DAYS; day < today; day++) {
    const settled = istDayStart(day + 1) + SETTLE_MS;
    if (settled > now || istDayStart(day) < since) continue;
    const row = done.get(day);
    if (!row || row.figures?.v !== FIGURES_VERSION || Date.parse(row.computed_at) < settled) due.push(day);
  }
  return due;
}

async function ownDayRows(owner: Owner, from: string): Promise<(DayRow & { vin_hash: string; figures: DayFigures })[]> {
  const { data, error } = await ownerDb(owner)
    .from("fleet_car_days")
    .select("vehicle_id:vehicle_id::text, vin_hash, day, computed_at, figures")
    .gte("day", from)
    .order("day");
  if (error) throw new Error(`Reading shared days failed: ${error.message}`);
  return (data ?? []) as unknown as (DayRow & { vin_hash: string; figures: DayFigures })[];
}

export type OwnersRun = { owners: number; cars: number; computed: number; left: number; failed: number; published: number | null; skipped?: string };

// Once a day: works out every shared car's missing days, oldest first, until the budget runs out (the rest
// go next run), then the totals across all shared cars, then deletes day rows past KEEP_DAYS and those of
// accounts that stopped sharing. A day already worked out is skipped, so runs converge.
export async function runOwners(clock: () => number = Date.now): Promise<OwnersRun> {
  const run: OwnersRun = { owners: 0, cars: 0, computed: 0, left: 0, failed: 0, published: null };
  if (DEMO) return { ...run, skipped: "demo" };
  const started = clock();
  const deadline = started + BUDGET_MS;
  let owners: Owner[];
  try {
    owners = await sharingOwners();
  } catch (err) {
    if (err instanceof MissingSchema) return { ...run, skipped: "no owners tables" };
    throw err;
  }
  run.owners = owners.length;
  const from = dateOf(istDay(started) - WINDOW_DAYS);
  for (const owner of owners) {
    try {
      const [cars, rows] = await Promise.all([sharedCars(owner), ownDayRows(owner, from)]);
      for (const car of cars) {
        run.cars++;
        const due = dueDays(rows.filter((row) => row.vehicle_id === car.id), car.since, started);
        if (due.length === 0) continue;
        if (clock() > deadline) {
          run.left += due.length;
          continue;
        }
        try {
          const days = await computeCarDays(owner, car, due, started, () => clock() > deadline);
          await saveDays(owner, car, days, clock());
          run.computed += days.length;
          run.left += due.length - days.length;
        } catch (err) {
          run.failed++;
          console.warn("Working out a shared car's days failed:", messageOf(err));
        }
      }
    } catch (err) {
      run.failed++;
      console.warn("Reading an account's shared cars failed:", messageOf(err));
    }
  }
  run.published = await publishStats(started);
  await pruneSharedDays(dateOf(istDay(started) - KEEP_DAYS), owners.map((o) => o.userId));
  await pruneOwnerStats(iso(started - KEEP_DAYS * DAY));
  return run;
}

async function saveDays(owner: Owner, car: SharedCar, days: CarDay[], at: number): Promise<void> {
  if (days.length === 0) return;
  const hash = vinHash(car.vin);
  const { error } = await ownerDb(owner)
    .from("fleet_car_days")
    .upsert(
      days.map((d) => ({ vehicle_id: car.id, vin_hash: hash, day: dateOf(d.day), figures: d.figures, computed_at: iso(at) })),
      { onConflict: "user_id,vehicle_id,day" },
    );
  if (error) throw new Error(`Saving shared days failed: ${error.message}`);
}

// Day rows to one summary per car: complete days of the window, by the current method.
function summaries(rows: { user_id: number; vehicle_id: string; vin_hash: string; day: string; figures: unknown }[], today: number): CarSummary[] {
  const cars = new Map<string, { owner: number; vinHash: string; days: CarDay[] }>();
  for (const row of rows) {
    const day = dayOf(row.day);
    const figures = row.figures as DayFigures;
    if (day >= today || day < today - WINDOW_DAYS || figures?.v !== FIGURES_VERSION) continue;
    const key = `${row.user_id}:${row.vehicle_id}`;
    const car = cars.get(key) ?? { owner: row.user_id, vinHash: row.vin_hash, days: [] };
    car.days.push({ day, figures });
    cars.set(key, car);
  }
  return [...cars.values()].map((c) => summarise(c.days, { vinHash: c.vinHash, owner: c.owner }));
}

// The totals across every shared car, stored as a new fleet_stats row. Returns how many cars they cover.
export async function publishStats(at: number): Promise<number> {
  const owners = await sharingOwners();
  const today = istDay(at);
  const rows = await sharedCarDays(
    owners.map((o) => o.userId),
    dateOf(today - WINDOW_DAYS),
  );
  const stats = aggregate(summaries(rows, today));
  await saveOwnerStats({ computed_at: iso(at), cars: stats.cars, stats });
  return stats.cars;
}

// Turning sharing on records it; the next morning's run works out the car's days. Turning it off deletes
// the account's day rows at once, and the car leaves the totals at the next morning's run. Publishing now
// would differ from the last totals by that car alone, so comparing the two would give its values away.
export async function setSharing(owner: Owner, on: boolean, now = Date.now()): Promise<void> {
  await setSharingFlag(owner, on, iso(now));
  if (on) return;
  const { error } = await ownerDb(owner).from("fleet_car_days").delete();
  if (error) throw new Error(`Deleting shared figures failed: ${error.message}`);
}

// ---- The page ----

// Demo mode has no database: whether the demo owner shares is a cookie, set by the same buttons.
export const DEMO_SHARING_COOKIE = "uplink-demo-owners";

async function demoSharing(): Promise<boolean> {
  return (await cookies()).get(DEMO_SHARING_COOKIE)?.value !== "off";
}

// Whether the owner shares; null before the migration, when sharing doesn't exist yet.
export async function sharingState(owner: Owner): Promise<Sharing | null> {
  if (DEMO) return { on: await demoSharing(), since: null };
  return sharingOf(owner).catch((err) => {
    if (err instanceof MissingSchema) return null;
    throw err;
  });
}

// What /owners shows. An owner who doesn't share gets no figures at all, only how many do. While waiting,
// `counted` is the owners in the latest totals: what the next run would publish from, not every account
// that shares (one whose cars have no days yet isn't in them).
export type OwnersPage =
  | { kind: "off"; sharers: number }
  | { kind: "waiting"; counted: number }
  | { kind: "ready"; stats: OwnerStats; updatedAt: string; you: CarSummary | null; group: string | null; lfp: boolean };

// The owner's own 30 days, from their day rows: the car with the most of them.
async function ownSummary(owner: Owner, now: number): Promise<CarSummary | null> {
  const today = istDay(now);
  const rows = await ownDayRows(owner, dateOf(today - WINDOW_DAYS));
  const list = summaries(
    rows.map((row) => ({ ...row, user_id: owner.userId })),
    today,
  );
  return list.sort((a, b) => b.days - a.days)[0] ?? null;
}

// The owner's group before their days are worked out: their first car's model, battery and drive.
async function ownGroup(owner: Owner): Promise<{ group: string | null; lfp: boolean }> {
  const car = (await sharedCars(owner))[0];
  const details = car ? await loadCarDetails(owner, car.id).catch(() => null) : null;
  return { group: segmentOf(details), lfp: details?.likelyLfp ?? false };
}

export async function loadOwners(owner: Owner, now: number): Promise<OwnersPage> {
  if (DEMO) return demoOwners(owner, now);
  const sharing = await sharingState(owner);
  if (!sharing?.on) return { kind: "off", sharers: (await sharingOwners().catch(() => [])).length };
  const latest = await latestOwnerStats().catch((err) => {
    if (err instanceof MissingSchema) return null;
    throw err;
  });
  const stats = latest?.stats as OwnerStats | undefined;
  if (!latest || !stats || stats.v !== STATS_VERSION || stats.cars < MIN_CARS || stats.owners < MIN_CARS) return { kind: "waiting", counted: stats?.owners ?? 0 };
  const you = await ownSummary(owner, now);
  const { group, lfp } = you ? { group: you.segment, lfp: you.lfp } : await ownGroup(owner);
  return { kind: "ready", stats, updatedAt: latest.computed_at, you, group, lfp };
}

// The demo: a made-up set of about 40 cars (lib/server/demo/owners.ts) and the demo car's own 30 days,
// worked out from its generated readings by the same code as a real car's. Rebuilt at most once a minute.
let demoYou: { at: number; summary: CarSummary | null } | undefined;

async function demoOwners(owner: Owner, now: number): Promise<OwnersPage> {
  const set = demoOwnerSummaries(now);
  const owners = new Set(set.map((s) => s.owner)).size;
  if (!(await demoSharing())) return { kind: "off", sharers: owners };
  if (!demoYou || now - demoYou.at > 60_000) {
    const car = (await sharedCars(owner))[0];
    const today = istDay(now);
    const days = await computeCarDays(owner, car, Array.from({ length: WINDOW_DAYS }, (_, k) => today - WINDOW_DAYS + k), now);
    demoYou = { at: now, summary: summarise(days, { vinHash: "demo", owner: 0 }) };
  }
  const you = demoYou.summary;
  return { kind: "ready", stats: aggregate([...set, ...(you ? [you] : [])]), updatedAt: iso(istDayStart(istDay(now)) + 3.5 * HOUR), you, group: you?.segment ?? null, lfp: you?.lfp ?? false };
}

// ---- For the owner's own AI ----

export const NOT_SHARING_MESSAGE =
  "You don't share your car's figures, so Uplink can't show how other owners compare. Turn on Share with other owners in Uplink's Settings, then ask again.";

// The connector's get_owner_comparisons: everything /owners shows, as plain JSON, plus Uplink's cars by home
// state. An owner who doesn't share gets the way to start, and no figures. Only totals leave here.
export async function ownerComparisons(owner: Owner, now: number) {
  const page = await loadOwners(owner, now);
  if (page.kind === "off") return { sharing: false, message: NOT_SHARING_MESSAGE };
  if (page.kind === "waiting") {
    return {
      sharing: true,
      ready: false,
      message:
        page.counted < MIN_CARS
          ? `${page.counted} of ${MIN_CARS} owners counted so far. Figures show once ${MIN_CARS} owners' cars are counted. Cars are counted at 3:30 AM each day.`
          : "The totals come with the next update, at 3:30 AM.",
    };
  }
  // Every state's own count, as the Rollout page shows signed-in owners: holding small states back here would
  // hide nothing Rollout doesn't already show.
  const states = stateTotals(await carStates(), 1);
  return {
    sharing: true,
    ready: true,
    period: `Last ${WINDOW_DAYS} days, IST`,
    computed_at: page.updatedAt,
    about:
      "Totals from Tesla owners in India who share their figures in Uplink. Each figure is across at least 5 cars, never one car's values. `yours` is the asking owner's own car, given only for their own group, with where it sits: lower than most (below the middle half), about the middle, or higher than most (above it).",
    owners_sharing: page.stats.owners,
    cars_sharing: page.stats.cars,
    your_model_group: page.group,
    your_battery: page.lfp ? "LFP" : "not LFP",
    comparisons: comparisons(page.stats, page),
    cars_by_state: {
      about:
        "Uplink's own cars by home state: every car using Uplink, sharing or not. Not all Teslas in India. A car's home state is the state it is in most often when Uplink checks it, or else the state of the Superchargers it uses most. Every state with a car is listed, as on Uplink's Rollout page.",
      states: states.states.map((s) => ({ state: s.name, cars: s.cars })),
      state_not_known: states.notKnown,
      total_cars: states.total,
    },
  };
}
