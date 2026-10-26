// Demo data for `bun run demo`: ten months in the life of one car, built from a seeded random generator
// and anchored to "now" so the dates stay current. Pure (no database, no network); index.ts serves it.
//
// It writes what the real car would: Fleet Telemetry readings (field, time, value) and the rows the poll
// and the Supercharger sync store. The loaders feed those into the same functions as the real path
// (buildSessions, packEstimates, dailyDistance, ...), so the pages show what real data produces.
import { MILES_TO_KM } from "@/lib/car";
import type { CarFlags } from "@/lib/car-notices";
import { DEMO_ROUTES } from "./routes";
import type { ReleaseNotesByVersion } from "@/lib/release-notes";
import { istDay as istDayName, type Status } from "@/lib/status";
import { istDay, istDayStart, type Reading } from "@/lib/telemetry-derive";
import { type Season, seasonOf } from "@/lib/seasons";
import type { ChargingSession } from "../charging";
import type { PollRun, Snapshot, Vehicle, VersionChange } from "../dashboard";

export const DEMO_VIN = "LRWYGCEK3TC100001";

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

const DAYS = 296; // the car is ten months old
const WINDOW_DAYS = 90; // detailed readings (battery, drives, updates) cover the last 90 days; charging covers every day
const STATUS_DAYS = 90; // the status page's health checks
const START_KM = 18;
const NOW_KM = 3335;
const NOW_LEVEL = 61;
const CHARGE_LIMIT = 80;
const FULL_RANGE_KM = 434; // rated range at 100%
const DRIVE_WH_PER_KM = 128; // drawn from the pack while driving; regen gives back REGEN_SHARE of it
const REGEN_SHARE = 0.15;
const PARKED_KWH_PER_DAY = 0.25;
// How hard each season is on efficiency in Bengaluru: AC in summer, rain, wipers and demisting in the
// monsoon. Only before the last two weeks, whose driving is fitted to the week comparison and the level now.
const SEASON_ENERGY: Record<Season, number> = { winter: 0.97, summer: 1.03, monsoon: 1.18, postMonsoon: 1 };
const AC_KW = 7.2; // 230 V x 32 A, single phase
const AC_EFFICIENCY = 0.92; // wall to pack
const DC_EFFICIENCY = 0.95;
const RATE_INR = 24;
// The car lives in Bengaluru: weekend detours stop in town, long trips on the way to Mysuru.
const CITY_SITES = ["Bengaluru, Nexus Koramangala", "Bengaluru, Phoenix Marketcity Whitefield", "Bengaluru, Mall of Asia Hebbal"];
const HIGHWAY_SITES = ["Mysuru, Mall of Mysore", "Maddur, Bengaluru-Mysuru Expressway"];

// Full-pack energy: about 64 kWh now, a little more before (about 1% per 90 days). Flat before four months back.
const packKwh = (now: number, t: number) => 64 + 0.0071 * Math.min(120, Math.max(0, (now - t) / DAY));

// The car's updates, newest first. The oldest is what it shipped with.
const RELEASES: [version: string, daysAgo: number][] = [
  ["2026.38.5.1", 9],
  ["2026.38.3.1", 24],
  ["2026.32.3", 51],
  ["2026.26.6", 86],
  ["2026.20.6.10", 130],
  ["2026.14.6.6", 168],
  ["2026.8.3", 210],
  ["2026.2.9", 252],
  ["2025.44.25.1", 296],
];
export const PENDING_VERSION = "2026.44.5";

// The first two are Tesla's own text from the Fleet API; the rest are plausible stand-ins.
const NOTES: ReleaseNotesByVersion = {
  "2026.38.5.1": [{ title: "Security Improvements", description: "This update includes important security fixes and improvements." }],
  "2026.38.3.1": [
    {
      title: "Halloween Mode",
      description:
        "Spread holiday fear year round with Halloween Mode. Put a Ghost Costume on your car visualization. Turn on Trick or Treat Mode to play spooky sounds and flicker the lights when visitors approach. Schedule a haunting light show, and turn your car into a chilling Photobooth!",
    },
    { title: "Security Improvements", description: "This update includes important security fixes and improvements." },
  ],
  "2026.32.3": [
    { title: "Wheel Selection", description: "Choose from new wheel options to customize the appearance of your Tesla." },
    {
      title: "Apple Music",
      description: "Go to Search, select Apple Music, then tap Library to find the songs, albums, and playlists you've added",
    },
    { title: "Security Improvements", description: "This update includes important security fixes and improvements." },
  ],
  "2026.26.6": [
    { title: "Improved Route Preview", description: "The map now shows charging stops and estimated arrival charge along your whole route." },
    { title: "Security Improvements", description: "This update includes important security fixes and improvements." },
  ],
  "2026.20.6.10": [
    { title: "Dashcam Viewer", description: "Review saved dashcam clips on the touchscreen, with a timeline to jump to the moment you want." },
    { title: "Charging Schedule", description: "Set different departure times for each day of the week." },
  ],
  "2026.14.6.6": [{ title: "Climate Preconditioning", description: "The cabin now preconditions earlier on hot days when you've scheduled a departure." }],
  [PENDING_VERSION]: [
    { title: "Park Assist", description: "The parking visualization now shows the distance to nearby objects more clearly." },
    { title: "Security Improvements", description: "This update includes important security fixes and improvements." },
  ],
};

const CONFIG = {
  car_type: "modely",
  trim_badging: "50",
  performance_package: "Base",
  efficiency_package: "MYRefresh2025Row",
  exterior_color: "DiamondBlack",
  wheel_type: "Crossflow19",
  roof_color: "RoofColorGlass",
  interior_trim_type: "Black2",
  driver_assist: "TeslaAP4",
  charge_port_type: "CCS",
  rhd: true,
  has_seat_cooling: true,
  rear_seat_heaters: 1,
  has_air_suspension: false,
  rear_drive_unit: "PM216MOSFET",
  default_charge_to_max: true,
  motorized_charge_port: true,
  wheel_caps_on: true,
  exterior_trim: "Black",
};

// The rest of the poll's raw JSON the car page reads.
const VEHICLE_STATE = {
  tpms_rcp_front_value: 2.9,
  tpms_rcp_rear_value: 2.9,
  sentry_mode_available: true,
  dashcam_clip_save_supported: true,
  webcam_supported: true,
};

// The top-level flags of the poll's response: no unpaid Supercharger balance, not in service.
const FLAGS: CarFlags = { supercharger_payment_needed: false, in_service: false };

export type HealthRow ={ component: string; status: Status; checked_at: string };
export type HealthDaily = { component: string; day: string; status: Status; up: number; total: number };

export type DemoData = {
  now: number;
  vin: string;
  vehicle: Vehicle;
  snapshot: Snapshot;
  config: typeof CONFIG;
  vehicleState: typeof VEHICLE_STATE;
  flags: CarFlags;
  superchargingEnabled: boolean;
  odometerMiles: number;
  history: VersionChange[]; // newest first
  notes: ReleaseNotesByVersion;
  readings: Record<string, Reading[]>; // by field, oldest first
  teslaSessions: ChargingSession[]; // newest first
  lastRun: PollRun;
  healthDaily: HealthDaily[];
  healthLatest: HealthRow[]; // newest first
  stats: { levelNow: number; packNow: number; minLevel: number };
};

// Small seeded generator (mulberry32). Each use is seeded by what it describes (a day, an update), so a
// day looks the same however often the data is rebuilt.
export function rngFor(...parts: number[]) {
  let seed = parts.reduce((h, p) => Math.imul(h ^ (p | 0), 0x9e3779b1) >>> 0, 0x1234567);
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export type Rng = () => number;
export const between = (rng: Rng, a: number, b: number) => a + rng() * (b - a);
const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;
const dow = (day: number) => (day + 4) % 7; // 0 = Sunday; 1970-01-01 was a Thursday
const weekend = (day: number) => dow(day) === 0 || dow(day) === 6;

type Stop = { supercharger: boolean; at: number }; // at: how far along the trip (0-1) the stop is
// after: the days since the last charge (scaled to the level now). pinned: the two weeks the dashboard's
// "This week" compares, set by hand so the comparison reads like a normal week.
type Trip = { start: number; km: number; mult: number; kind: "regular" | "detour" | "long"; stop?: Stop; after?: boolean; pinned?: boolean };

export function generateDemo(now: number): DemoData {
  const today = istDay(now);
  const first = today - DAYS;
  const windowStart = now - WINDOW_DAYS * DAY;
  const at = (day: number, hour: number) => istDayStart(day) + hour * HOUR;

  // What each day holds. Detours and long trips stop at a fast charger.
  const special = new Map<number, Trip[]>();
  const precharge = new Set<number>(); // the evening before a long trip is a charge to the limit
  for (let d = first + 3; d <= today - 14; d++) {
    const rng = rngFor(3, d);
    const roll = rng();
    if (dow(d) === 6 && roll < 0.06) {
      special.set(d, [{ start: at(d, between(rng, 6.5, 8)), km: Math.round(between(rng, 200, 300)), mult: 1, kind: "long", stop: { supercharger: true, at: 0.6 } }]);
      precharge.add(d - 1);
    } else if (weekend(d) && roll > 0.93) {
      special.set(d, [{ start: at(d, between(rng, 10, 13)), km: Math.round(between(rng, 60, 100)), mult: 1, kind: "detour", stop: { supercharger: true, at: 0.45 } }]);
    }
  }
  // Two quick top-ups at a third-party CCS charger.
  for (const ago of [23, 61]) {
    const d = today - ago;
    const rng = rngFor(8, d);
    special.set(d, [{ start: at(d, between(rng, 10, 13)), km: Math.round(between(rng, 40, 70)), mult: 1, kind: "detour", stop: { supercharger: false, at: 0.5 } }]);
  }

  const trips: Trip[] = [];
  for (let d = first; d <= today; d++) {
    const rng = rngFor(1, d);
    const mult = () => between(rng, 0.92, 1.1);
    if (d >= today - 13) continue; // the last two weeks are fixed below
    const planned = special.get(d);
    if (planned) {
      trips.push(...planned.map((t) => ({ ...t, mult: mult() })));
    } else if (weekend(d)) {
      if (rng() < 0.6) {
        const count = rng() < 0.4 ? 2 : 1;
        for (let k = 0; k < count; k++) trips.push({ start: at(d, between(rng, 10 + k * 4, 13 + k * 4)), km: between(rng, 6, 28), mult: mult(), kind: "regular" });
      }
    } else if (rng() < 0.45) {
      trips.push({ start: at(d, between(rng, 7, 9.5)), km: between(rng, 4, 11), mult: mult(), kind: "regular" });
      trips.push({ start: at(d, between(rng, 17, 19.5)), km: between(rng, 4, 11), mult: mult(), kind: "regular" });
    }
  }
  // The days since the last charge: enough driving to be at NOW_LEVEL now, scaled to fit below.
  const after: [number, number, number][] = [
    [today - 4, 10.5, 12],
    [today - 3, 8, 6],
    [today - 3, 18.5, 6],
    [today - 1, 11, 22],
    [today, 8.3, 7],
  ];
  for (const [d, hour, km] of after) trips.push({ start: at(d, hour), km, mult: 1.03, kind: "regular", after: true });
  // The nine days before those: an office commute on weekdays and one errand on weekend days, so the
  // week before this one drives about as far as this one.
  for (let d = today - 13; d <= today - 5; d++) {
    const rng = rngFor(17, d);
    const mult = () => between(rng, 0.95, 1.06);
    if (weekend(d)) {
      trips.push({ start: at(d, between(rng, 10.5, 12.5)), km: round(between(rng, 14, 20), 1), mult: mult(), kind: "regular", pinned: true });
    } else {
      trips.push({ start: at(d, between(rng, 8, 9.2)), km: round(between(rng, 7, 9), 1), mult: mult(), kind: "regular", pinned: true });
      trips.push({ start: at(d, between(rng, 18, 19.5)), km: round(between(rng, 7, 9), 1), mult: mult(), kind: "regular", pinned: true });
    }
  }
  const done = (t: Trip) => t.start + (t.km * 2 + 20) * MIN <= now - 15 * MIN;
  const kept = trips.filter((t) => t.start <= now && done(t));

  // Energy since the last charge (at 80%) fixes how far the final days were driven.
  const netKwhPerKm = (DRIVE_WH_PER_KM / 1000) * (1 - REGEN_SHARE);
  const sinceRef = at(today - 4, 3);
  const needKwh = ((CHARGE_LIMIT - NOW_LEVEL) / 100) * packKwh(now, now) - (PARKED_KWH_PER_DAY * (now - sinceRef)) / DAY;
  const afterTrips = kept.filter((t) => t.after);
  const afterScale = needKwh / afterTrips.reduce((sum, t) => sum + t.km * t.mult * netKwhPerKm, 0);
  for (const t of afterTrips) t.km *= afterScale;
  // The rest of the regular driving adds up to the odometer now.
  const afterKm = afterTrips.reduce((sum, t) => sum + t.km, 0);
  const fixedKm = kept.filter((t) => t.kind !== "regular" || t.pinned).reduce((sum, t) => sum + t.km, 0);
  const base = kept.filter((t) => t.kind === "regular" && !t.after && !t.pinned);
  const baseScale = (NOW_KM - START_KM - fixedKm - afterKm) / base.reduce((sum, t) => sum + t.km, 0);
  for (const t of base) t.km *= baseScale;

  // Events in time order: trips, home charges and a daily tick that records the parked drain.
  type Event = { start: number; trip?: Trip; ac?: { final: boolean; force: boolean; below: number } };
  const events: Event[] = [
    ...kept.map((trip) => ({ start: trip.start, trip })),
  ];
  // Every evening is a chance to charge at home: the car does when it is below some level (usually about 58%).
  // The last charge, five days ago, is fixed, and none follows it, so the level now is known.
  for (let d = first + 2; d <= today - 5; d++) {
    const rng = rngFor(9, d);
    events.push({ start: at(d, between(rng, 20.5, 23)), ac: { final: d === today - 5, force: precharge.has(d), below: between(rng, 50, 66) } });
  }
  // At 23:18 IST, over 10 minutes before the night check (23:30), so that check finds the car asleep.
  for (let d = first; d <= today; d++) if (at(d, 23.3) <= now) events.push({ start: at(d, 23.3) });
  events.sort((a, b) => a.start - b.start);

  // ---- The simulation ----
  const rows: { field: string; t: number; value: unknown }[] = [];
  const COUNTERS = new Set(["Odometer", "LifetimeEnergyUsed", "LifetimeEnergyGainedRegen"]);
  // Counters and charging sessions are kept for every day, so the monthly charts and the session list go
  // back to delivery; everything else only inside the window.
  let charging = false;
  const push = (field: string, t: number, value: unknown) => {
    if (COUNTERS.has(field) || charging || t >= windowStart) rows.push({ field, t, value });
  };
  const noise = rngFor(10);
  const gauss = () => (noise() + noise() + noise() - 1.5) * 2;

  // ---- The last 30 days in detail: where the car went, speed, acceleration, power and grade ----
  // The car lives in Koramangala; drives go out to a few places and back along real roads (DEMO_ROUTES,
  // from OpenStreetMap), long ones to Mysuru.
  const richFrom = now - 30 * DAY;
  const HOME = { lat: 12.9352, lng: 77.6245 };
  const OUT = ["indiranagar", "hebbal", "btm", "whitefield"];
  let away: string | null = null; // the route the car is at the far end of, or null at home
  const end = (key: string) => {
    const [lng, lat] = DEMO_ROUTES[key].path.at(-1)!;
    return { lat, lng };
  };
  let here = { ...HOME };
  // The point a fraction of the way along a path, by distance.
  const along = (path: [number, number][], f: number) => {
    const legs = path.slice(1).map((p, k) => Math.hypot(p[0] - path[k][0], p[1] - path[k][1]));
    const total = legs.reduce((a, b) => a + b, 0);
    let left = f * total;
    for (let k = 0; k < legs.length; k++) {
      if (left <= legs[k] || k === legs.length - 1) {
        const r = legs[k] ? Math.min(1, left / legs[k]) : 0;
        return { lng: path[k][0] + (path[k + 1][0] - path[k][0]) * r, lat: path[k][1] + (path[k + 1][1] - path[k][1]) * r };
      }
      left -= legs[k];
    }
    return { lng: path.at(-1)![0], lat: path.at(-1)![1] };
  };
  // Outside temperature in Bengaluru: about 22 °C before dawn to 32 °C mid-afternoon.
  const outsideAt = (t: number) => 27 + 5 * Math.sin((2 * Math.PI * (((t - istDayStart(istDay(t))) / HOUR - 9) % 24)) / 24);

  let clock = at(first, 8);
  let energy = 0.75 * packKwh(now, clock); // kWh in the pack
  let odometer = START_KM / MILES_TO_KM; // miles
  let used = 4.2; // lifetime kWh drawn
  let regen = 0.3; // lifetime kWh from regen
  let minLevel = 100;
  const odometerSeries: { t: number; miles: number }[] = [];
  const teslaSessions: ChargingSession[] = [];
  let sessionNo = 0;

  const level = (t: number) => (energy / packKwh(now, t)) * 100;
  const parked = (t: number) => {
    if (t <= clock) return;
    const kwh = (PARKED_KWH_PER_DAY * (t - clock)) / DAY;
    energy -= kwh;
    used += kwh;
    clock = t;
  };
  const pack = (t: number) => {
    // The readings the car sends together: level, state of charge, energy left and rated range.
    const l = level(t);
    minLevel = Math.min(minLevel, l);
    push("BatteryLevel", t, round(l, 1));
    push("Soc", t, round(l + 0.6, 1));
    push("EnergyRemaining", t, round(energy + gauss() * 0.06, 2));
    push("RatedRange", t, round(((l / 100) * FULL_RANGE_KM * packKwh(now, t)) / 64 / MILES_TO_KM, 1));
  };
  const counters = (t: number, withOdometer: boolean) => {
    push("LifetimeEnergyUsed", t, round(used, 3));
    push("LifetimeEnergyGainedRegen", t, round(regen, 3));
    if (withOdometer) {
      push("Odometer", t, round(odometer, 2));
      odometerSeries.push({ t, miles: odometer });
    }
  };

  const drive = (start: number, km: number, mult: number): number => {
    const minutes = km * 1.9 + 6;
    const steps = Math.max(2, Math.round(km / 1.5));
    const season = start < istDayStart(today - 13) ? SEASON_ENERGY[seasonOf(start)] : 1;
    parked(start);
    pack(start);
    push("Gear", start, "ShiftStateD");
    if (start >= richFrom) {
      // Where it goes: out from home (to work in Whitefield on weekday mornings), or back home the way it
      // came; Mysuru on a long trip.
      const rng = rngFor(20, start / MIN);
      const morning = (start - istDayStart(istDay(start))) / HOUR < 11;
      const goingOut = away === null;
      const key = goingOut ? (km > 80 ? "mysuru" : morning && !weekend(istDay(start)) ? "whitefield" : OUT[Math.floor(rng() * OUT.length)]) : away!;
      const path = goingOut ? DEMO_ROUTES[key].path : [...DEMO_ROUTES[key].path].reverse();
      const dest = goingOut ? end(key) : HOME;
      // Stop-and-go, like city traffic: pull away at 1.5 to 2.5 m/s², cruise near a target speed, brake at
      // 2 to 3.5 m/s² for a signal, wait, go again. Highways cruise faster with fewer stops. Power comes
      // from a 2,000 kg car's acceleration plus rolling and air drag; braking shows as regen (negative).
      const highway = km > 80;
      const total = Math.max(30, Math.round(minutes * 60)); // seconds, simulated one at a time
      const RECORD_S = 5; // the car sends these about every few seconds while driving
      let v = 0; // m/s
      let phase: "go" | "cruise" | "brake" | "wait" = "go";
      let target = (highway ? between(rng, 75, 100) : between(rng, 30, 50)) / 3.6;
      let left = between(rng, 60, highway ? 900 : 180); // seconds until the next stop
      let pull = between(rng, 1.5, 2.5);
      let stop = between(rng, 2, 3.5);
      let grade = 0;
      push("OutsideTemp", start, round(outsideAt(start) + gauss() * 0.3, 1));
      for (let sec = 0; sec <= total; sec++) {
        // Bring it to a stop for the last part of the drive.
        if (phase !== "wait" && total - sec <= 20) phase = "brake";
        let accel = 0;
        if (phase === "go") {
          accel = Math.min(pull, target - v);
          if (v + accel >= target) phase = "cruise";
        } else if (phase === "cruise") {
          accel = Math.max(-0.4, Math.min(0.4, (target - v) * 0.1 + (rng() - 0.5) * 0.3));
          if (--left <= 0) phase = "brake";
        } else if (phase === "brake") {
          accel = -Math.min(stop, v);
          if (v + accel <= 0) {
            phase = "wait";
            left = between(rng, 20, 60);
          }
        } else if (--left <= 0 && sec < total - 30) {
          phase = "go";
          target = (highway ? between(rng, 75, 100) : between(rng, 30, 50)) / 3.6;
          left = between(rng, 60, highway ? 900 : 180);
          pull = between(rng, 1.5, 2.5);
          stop = between(rng, 2, 3.5);
        }
        v = Math.max(0, v + accel);
        if (sec % RECORD_S !== 0) continue;
        const t = start + sec * 1000;
        if (sec % (RECORD_S * 2) === 0) {
          const p = along(path, sec / total);
          push("Location", t, { latitude: round(p.lat, 6), longitude: round(p.lng, 6) });
        }
        grade = Math.max(-6, Math.min(6, grade + (rng() - 0.5) * 0.6));
        const kw = Math.max(-60, (2000 * accel * v + 0.012 * 2000 * 9.81 * v + 0.5 * 1.2 * 0.23 * 2.6 * v ** 3 + 2000 * 9.81 * (grade / 100) * v) / 1000 + 0.4);
        push("VehicleSpeed", t, round((v * 3.6) / MILES_TO_KM, 1));
        push("LongitudinalAcceleration", t, round(accel + gauss() * 0.05, 2));
        push("GradeEstimatePercent", t, round(grade, 1));
        // An LFP pack at about 355 V; the car reports discharge as negative current, as yours does.
        push("PackVoltage", t, round(356 - kw * 0.15, 1));
        push("PackCurrent", t, round(-(kw * 1000) / (356 - kw * 0.15), 1));
      }
      here = { ...dest };
      away = goingOut ? key : null;
      push("LocatedAtHome", start + minutes * MIN, !goingOut);
      push("LocatedAtWork", start + minutes * MIN, goingOut && key === "whitefield");
    }
    for (let i = 1; i <= steps; i++) {
      const t = start + (minutes * MIN * i) / steps;
      const step = km / steps;
      parked(t);
      const gross = (step * DRIVE_WH_PER_KM * mult * season) / 1000;
      energy -= gross * (1 - REGEN_SHARE);
      used += gross;
      regen += gross * REGEN_SHARE;
      odometer += step / MILES_TO_KM;
      clock = Math.max(clock, t);
      counters(t, true);
      pack(t);
    }
    push("Gear", start + minutes * MIN, "ShiftStateP");
    return start + minutes * MIN;
  };

  const target = () => (CHARGE_LIMIT / 100) * packKwh(now, clock);

  const homeCharge = (start: number, ac: { final: boolean; force: boolean; below: number }) => {
    parked(start);
    const rng = rngFor(11, start / MIN);
    if (!ac.final && !ac.force && level(start) >= ac.below) return;
    charging = true;
    if (start >= richFrom) push("Location", start, { latitude: HOME.lat, longitude: HOME.lng });
    push("ChargingCableType", start, "CableTypeIEC");
    push("DetailedChargeState", start, "DetailedChargeStateStarting");
    pack(start);
    let t = start + 30_000;
    push("DetailedChargeState", t, "DetailedChargeStateCharging");
    push("ChargerVoltage", t, round(230 + between(rng, -2, 2), 0));
    push("ChargeAmps", t, 32);
    push("ChargerPhases", t, 1);
    let delivered = 0;
    for (;;) {
      const kw = round(AC_KW + between(rng, -0.1, 0.1), 1);
      const remaining = target() - energy;
      push("ACChargingPower", t, kw);
      push("ACChargingEnergyIn", t, round(delivered, 2));
      pack(t);
      if (remaining <= 0.01) break;
      const hours = Math.min(5 / 60, remaining / (kw * AC_EFFICIENCY));
      delivered += kw * hours;
      energy += kw * hours * AC_EFFICIENCY;
      t += hours * HOUR;
    }
    t += MIN;
    push("ACChargingPower", t, 0);
    push("DetailedChargeState", t, "DetailedChargeStateComplete");
    push("DetailedChargeState", t + 25 * MIN, "DetailedChargeStateDisconnected");
    charging = false;
    clock = t;
  };

  // Charging power by battery level, as a share of the charger's peak.
  const curve = (l: number) =>
    l < 10 ? 0.75 + 0.025 * l : l < 40 ? 1 : l < 60 ? 1 - (0.38 * (l - 40)) / 20 : l < 80 ? 0.62 - (0.32 * (l - 60)) / 20 : l < 90 ? 0.3 - (0.15 * (l - 80)) / 10 : 0.12;

  const fastCharge = (arrive: number, stop: Stop, aboutLevel: number, long: boolean) => {
    const rng = rngFor(12, arrive / MIN);
    parked(arrive);
    charging = true;
    if (arrive >= richFrom) push("Location", arrive + 2 * MIN, { latitude: here.lat, longitude: here.lng });
    const peak = stop.supercharger ? between(rng, 165, 195) : between(rng, 50, 58);
    const targetLevel = Math.min(CHARGE_LIMIT, Math.max(aboutLevel, level(arrive) + 8));
    const tempStart = round(between(rng, 29, 35) + (stop.supercharger ? 3 : 0), 1);
    const tempPeak = tempStart + (stop.supercharger ? between(rng, 9, 14) : between(rng, 3, 6));
    push("FastChargerPresent", arrive, true);
    push("FastChargerType", arrive, stop.supercharger ? "FastChargerSupercharger" : "FastChargerCombo");
    push("ChargingCableType", arrive, "CableTypeCCS");
    push("ModuleTempMax", arrive, tempStart);
    // The coolest module runs a steady 2 °C under the hottest.
    push("ModuleTempMin", arrive, round(tempStart - 2, 1));
    const start = arrive + 2.2 * MIN;
    push("DetailedChargeState", start, "DetailedChargeStateStarting");
    pack(start);
    let t = start + 30_000;
    push("DetailedChargeState", t, "DetailedChargeStateCharging");
    let delivered = 0;
    for (let k = 0; k < 90; k++, t += MIN) {
      const kw = round(peak * curve(level(t)) * between(rng, 0.97, 1.02), 1);
      push("DCChargingPower", t, kw);
      push("DCChargingEnergyIn", t, round(delivered, 2));
      pack(t);
      if (k % 2 === 1) {
        const hottest = tempStart + (tempPeak - tempStart) * (1 - Math.exp(-k / 14));
        push("ModuleTempMax", t, round(hottest, 1));
        push("ModuleTempMin", t, round(hottest - 2, 1));
      }
      if (level(t) >= targetLevel) break;
      delivered += kw / 60;
      energy += (kw / 60) * DC_EFFICIENCY;
    }
    const end = t + 30_000;
    push("DCChargingPower", end, 0);
    push("DetailedChargeState", end, "DetailedChargeStateComplete");
    push("FastChargerPresent", end + 3 * MIN, false);
    push("DetailedChargeState", end + 3 * MIN, "DetailedChargeStateDisconnected");
    charging = false;
    clock = end + 3 * MIN;
    if (stop.supercharger && delivered >= 1) {
      const kwh = round(delivered, 2);
      const sites = long ? HIGHWAY_SITES : CITY_SITES;
      const site = sites[Math.floor(rng() * sites.length)];
      sessionNo++;
      teslaSessions.push({
        session_id: String(4_810_000 + sessionNo * 37),
        vehicle_vin: DEMO_VIN,
        site_name: site,
        started_at: new Date(start - MIN).toISOString(),
        stopped_at: new Date(end + MIN).toISOString(),
        energy_kwh: kwh,
        cost_total: round(kwh * RATE_INR, 2),
        currency: "INR",
        invoices: [{ fileName: "invoice.pdf", contentId: `demo-invoice-${sessionNo}`, invoiceType: "CHARGING" }],
      });
    }
  };

  for (const event of events) {
    if (event.trip) {
      const trip = event.trip;
      if (!trip.stop) {
        drive(trip.start, trip.km, trip.mult);
      } else {
        const rng = rngFor(13, trip.start / MIN);
        const arrived = drive(trip.start, trip.km * trip.stop.at, trip.mult);
        fastCharge(arrived + 2 * MIN, trip.stop, trip.kind === "long" ? between(rng, 72, 80) : between(rng, 68, 80), trip.kind === "long");
        drive(clock + 5 * MIN, trip.km * (1 - trip.stop.at), trip.mult);
      }
    } else if (event.ac) {
      homeCharge(event.start, event.ac);
    } else {
      parked(event.start);
      counters(event.start, false);
    }
  }
  parked(now);
  const levelNow = level(now);

  // The last week, hourly: temperatures and cell voltages for the battery page.
  for (let t = now - 7 * DAY; t < now; t += HOUR) {
    const out = outsideAt(t) + gauss() * 0.3;
    push("OutsideTemp", t, round(out, 1));
    push("InsideTemp", t, round(out + 4 + gauss() * 0.5, 1));
    push("ModuleTempMax", t, round(out + 1.5 + gauss() * 0.3, 1));
    // LFP cells sit near 3.3 V most of the range, with a gap of a few mV, like your car's 3.292 to 3.294.
    const cell = 3.27 + (level(Math.min(t, clock)) / 100) * 0.07;
    const spread = 0.002 + noise() * 0.004;
    push("BrickVoltageMax", t, round(cell + spread / 2, 4));
    push("BrickVoltageMin", t, round(cell - spread / 2, 4));
  }

  // The car woke a few minutes ago and sent its state, which makes the dashboard show it as live.
  const woke = now - 3 * MIN;
  // How it is now: locked and parked at home, Sentry idle, windows shut, climate off, tyres a touch low
  // at the back.
  push("Locked", woke, true);
  push("SentryMode", woke, "SentryModeStateOff");
  // Tesla's own full-pack figure, a little above the estimate and moving with it, a reading a week.
  for (let t = windowStart; t < woke - 7 * DAY; t += 7 * DAY) push("NominalFullPackEnergyKwh", t, round(62.12 + packKwh(now, t) - packKwh(now, now), 2));
  push("NominalFullPackEnergyKwh", woke, 62.12);
  push("DoorState", woke, { DriverFront: false, DriverRear: false, PassengerFront: false, PassengerRear: false, TrunkFront: false, TrunkRear: false });
  for (const w of ["FdWindow", "FpWindow", "RdWindow", "RpWindow"]) push(w, woke, "WindowStateClosed");
  push("ChargePortDoorOpen", woke, false);
  push("HvacPower", woke, "HvacPowerStateOff");
  push("ClimateKeeperMode", woke, "ClimateKeeperModeStateOff");
  push("CabinOverheatProtectionMode", woke, "CabinOverheatProtectionModeStateFanOnly");
  push("TpmsPressureFl", woke, 2.9);
  push("TpmsPressureFr", woke, 2.9);
  push("TpmsPressureRl", woke, 2.8);
  push("TpmsPressureRr", woke, 2.75);
  // When each tyre was last measured, in Unix seconds: the fronts on waking, the rears two days ago.
  push("TpmsLastSeenPressureTimeFl", woke, Math.floor(woke / 1000));
  push("TpmsLastSeenPressureTimeFr", woke, Math.floor(woke / 1000));
  push("TpmsLastSeenPressureTimeRl", woke, Math.floor((woke - 2 * DAY) / 1000));
  push("TpmsLastSeenPressureTimeRr", woke, Math.floor((woke - 2 * DAY) / 1000));
  push("TpmsSoftWarnings", woke, { front_left: false, front_right: false, rear_left: false, rear_right: false });
  push("TpmsHardWarnings", woke, { front_left: false, front_right: false, rear_left: false, rear_right: false });
  pack(woke);
  push("DetailedChargeState", woke, "DetailedChargeStateDisconnected");
  push("ChargeLimitSoc", woke, CHARGE_LIMIT);
  // The state the car was in when the window began. The charging fields go back to delivery, so theirs
  // is the state on the first morning (inside the window, it could split a session in two).
  push("ChargeLimitSoc", windowStart, CHARGE_LIMIT);
  push("Gear", windowStart, "ShiftStateP");
  rows.push({ field: "DetailedChargeState", t: at(first, 7), value: "DetailedChargeStateDisconnected" });
  rows.push({ field: "FastChargerPresent", t: at(first, 7), value: false });

  // ---- Versions and updates ----
  const odometerAt = (t: number) => {
    let miles = START_KM / MILES_TO_KM;
    for (const p of odometerSeries) {
      if (p.t > t) break;
      miles = p.miles;
    }
    return miles;
  };
  const ordered = [...RELEASES].reverse(); // oldest first
  const history: VersionChange[] = ordered.map(([version, daysAgo], i) => {
    const detected = i === 0 ? at(first, 8) : at(today - daysAgo, between(rngFor(14, daysAgo), 1.5, 4));
    const availableAt = i === 0 ? null : detected - between(rngFor(15, daysAgo), 0.5, 4) * DAY;
    return {
      version,
      previous_version: i === 0 ? null : ordered[i - 1][0],
      detected_at: new Date(detected).toISOString(),
      available_at: availableAt === null ? null : new Date(availableAt).toISOString(),
      odometer_km: Math.round(odometerAt(detected) * MILES_TO_KM),
    };
  });
  // What the car streamed around each update inside the window.
  const inWindow = history.filter((h) => h.previous_version && Date.parse(h.detected_at) >= windowStart);
  push("Version", windowStart, history.filter((h) => Date.parse(h.detected_at) < windowStart).at(-1)?.version ?? "");
  push("SoftwareUpdateVersion", windowStart, "");
  push("SoftwareUpdateDownloadPercentComplete", windowStart, 0);
  push("SoftwareUpdateInstallationPercentComplete", windowStart, 1);
  for (const h of inWindow) {
    const rng = rngFor(16, Date.parse(h.detected_at) / MIN);
    const flipped = Date.parse(h.detected_at);
    const offered = Date.parse(h.available_at ?? h.detected_at);
    push("SoftwareUpdateVersion", offered, h.version);
    push("SoftwareUpdateExpectedDurationMinutes", offered, 36);
    const downloadStart = offered + between(rng, 20, 150) * MIN;
    const downloadMinutes = between(rng, 18, 42);
    let percent = 0;
    for (let t = downloadStart; percent < 100; t += (downloadMinutes * MIN) / 9) {
      percent = Math.min(100, percent + Math.round(between(rng, 7, 15)));
      push("SoftwareUpdateDownloadPercentComplete", t, percent);
    }
    const installMinutes = between(rng, 24, 34);
    const installStart = flipped - installMinutes * MIN;
    percent = 1;
    for (let t = installStart; percent < 100; t += (installMinutes * MIN) / 11) {
      percent = Math.min(100, percent + Math.round(between(rng, 6, 12)));
      push("SoftwareUpdateInstallationPercentComplete", t, percent);
    }
    push("Version", flipped, h.version);
    push("SoftwareUpdateVersion", flipped + 90_000, "");
    push("SoftwareUpdateDownloadPercentComplete", flipped + 90_000, 0);
    push("SoftwareUpdateInstallationPercentComplete", flipped + 90_000, 1);
  }

  // ---- Group the readings by field ----
  const readings: Record<string, Reading[]> = {};
  rows.sort((a, b) => a.t - b.t);
  for (const r of rows) (readings[r.field] ??= []).push({ at: new Date(r.t).toISOString(), value: r.value });

  // ---- The poll's rows ----
  const polledAt = new Date(now - 6 * MIN).toISOString();
  const current = history[history.length - 1];
  const snapshot: Snapshot = {
    polled_at: polledAt,
    state: "online",
    car_version: current.version,
    update_status: null,
    update_version: null,
    // A real idle snapshot: Tesla reports 0% / 1% and a 45 minute estimate with no update pending.
    download_perc: 0,
    install_perc: 1,
    expected_duration_sec: 2700,
    scheduled_time_ms: null,
    battery_level: Math.round(levelNow),
    battery_range_km: round(((levelNow / 100) * FULL_RANGE_KM * packKwh(now, now)) / 64, 1),
    charging_state: "Disconnected",
    charge_limit: CHARGE_LIMIT,
    charge_power_kw: null,
    time_to_full_h: null,
    error: null,
  };
  const vehicle: Vehicle = {
    id: "1",
    vin: DEMO_VIN,
    display_name: "Shadow",
    last_state: "online",
    current_version: current.version,
    last_seen_at: polledAt,
    last_polled_at: polledAt,
    model: "Model Y",
    exterior_color: "Diamond Black",
  };

  // Supercharger history, newest first.
  teslaSessions.sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));

  // ---- Health checks for the status page: every 30 minutes for 90 days ----
  const components = ["Website", "Database", "Live data receiver", "Car data stream"];
  const degradedDay = istDayName(now - 34 * DAY);
  const healthAll: HealthRow[] = [];
  for (let t = Math.floor((now - STATUS_DAYS * DAY) / (30 * MIN)) * 30 * MIN; t <= now; t += 30 * MIN) {
    const day = istDayName(t);
    const hour = ((t + 5.5 * HOUR) % DAY) / HOUR;
    for (const component of components) {
      const degraded = component === "Car data stream" && day === degradedDay && hour >= 2 && hour < 8;
      healthAll.push({ component, status: degraded ? "degraded" : "operational", checked_at: new Date(t).toISOString() });
    }
  }
  const daily = new Map<string, HealthDaily>();
  for (const r of healthAll) {
    const key = `${r.component}|${istDayName(Date.parse(r.checked_at))}`;
    const entry = daily.get(key) ?? { component: r.component, day: istDayName(Date.parse(r.checked_at)), status: "operational" as Status, up: 0, total: 0 };
    entry.total++;
    entry.up++; // degraded still counts as up
    if (r.status === "degraded") entry.status = "degraded";
    daily.set(key, entry);
  }

  return {
    now,
    vin: DEMO_VIN,
    vehicle,
    snapshot,
    config: CONFIG,
    vehicleState: VEHICLE_STATE,
    flags: FLAGS,
    superchargingEnabled: true,
    odometerMiles: odometer,
    history: history.reverse(),
    notes: NOTES,
    readings,
    teslaSessions,
    lastRun: { started_at: polledAt, ok: true, error: null },
    healthDaily: [...daily.values()],
    healthLatest: healthAll.slice(-40).reverse(),
    stats: { levelNow, packNow: packKwh(now, now), minLevel },
  };
}
