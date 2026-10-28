// The eval's inputs. Synthetic only: made-up Indian places, no VINs, no owner data. Findings and facts come
// from the app's own builders where a small input will do (the same shapes test/*.test.ts uses).
import { type Finding, type TipCar, type TipScope, type TipSurface, topFindings } from "@/lib/ai-tips";
import type { DayStrip } from "@/lib/awake";
import { BATTERY_TIPS, batteryFindings } from "@/lib/battery-tips";
import { CHARGE_TIPS, CHARGING_TIPS, chargeFindings, chargingFindings, type PricedCharge } from "@/lib/charge-tips";
import type { ClimateSummary } from "@/lib/drive-climate";
import { type DriveFacts, type DriveInput, describeDrive } from "@/lib/drive-facts";
import { DRIVE_TIPS, type DriveTipsInput, driveFindings, TRIP_TIPS } from "@/lib/drive-tips";
import { HARD_MS2 } from "@/lib/drive-verdict";
import type { Drive, ParkedPeriod } from "@/lib/drives";
import type { DrivingPeriod } from "@/lib/driving-figures";
import type { Timeframe } from "@/lib/periods";
import { WEEK_TIPS, type WeekInput, weekFindings } from "@/lib/week-wording";

export type EvalCase =
  | { id: string; kind: "tips"; scope: TipScope; car: TipCar; findings: Finding[]; note: string }
  | { id: string; kind: "drive"; facts: DriveFacts; note: string };

export const SURFACES: Record<TipScope, TipSurface> = { week: WEEK_TIPS, drive_tips: DRIVE_TIPS, trip_tips: TRIP_TIPS, charging: CHARGING_TIPS, charge: CHARGE_TIPS, battery: BATTERY_TIPS };

const NMC: TipCar = { name: "2025 Model Y Long Range, all-wheel drive", lfp: false };
const LFP: TipCar = { name: "2025 Model 3 Rear-Wheel Drive", lfp: true };

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

// What the page sends: the top findings, most useful first.
const tips = (id: string, scope: TipScope, car: TipCar, findings: Finding[], note: string): EvalCase => ({ id, kind: "tips", scope, car, findings: topFindings(findings), note });

// A finding written by hand, for a shape the builders don't give from a small input.
const hand = (kind: string, facts: Finding["facts"], extra: Partial<Finding> = {}): Finding => ({ kind, score: 1500, facts, say: "A plain line.", ...extra });

// Home's week.
const now = Date.parse("2026-10-27T12:00:00+05:30");
const frame = { span: { from: now - 7 * DAY, to: now } } as Timeframe;
const period = (km: number, whPerKm: number, kwh: number) => ({ km, whPerKm, kwh, regenKwh: null });
const driving = (cur: ReturnType<typeof period>, prev: ReturnType<typeof period> | null) => ({ current: cur, previous: prev }) as unknown as DrivingPeriod;
const drive = (dayAgo: number, km: number, kwh: number): Drive => ({ start: now - dayAgo * DAY, end: now - dayAgo * DAY + 30 * MIN, km, kwh, whPerKm: km >= 1 ? (kwh * 1000) / km : null, startLevel: 70, endLevel: 65 });
const charge = (id: string, dayAgo: number, name: string, area: string | null, kwh: number, cost: number, kind: "ac" | "dc" = "dc"): PricedCharge => ({ id, at: now - dayAgo * DAY, name, area, kwh, cost, kind });
const park = (dayAgo: number, hours: number, kwh: number): ParkedPeriod => ({ start: now - dayAgo * DAY, end: now - dayAgo * DAY + hours * HOUR, hours, lostPercent: kwh * 1.6, lostKm: null, kwh, watts: (kwh * 1000) / hours, awakeMs: 0, percentPerDay: ((kwh * 1.6) / hours) * 24, kmPerDay: null });
const usualDrives = [drive(10, 20, 2.6), drive(12, 22, 2.8), drive(14, 25, 3.2), drive(16, 18, 2.4), drive(18, 30, 3.8)];
const weekInput: WeekInput = {
  frame,
  driving: driving(period(120, 150, 18), period(100, 128, 12.8)),
  drives: [drive(1, 3, 0.6), drive(2, 4, 0.8), drive(3, 30, 3.9), ...usualDrives],
  priced: [charge("s1", 2, "IndianOil e-Charge, Whitefield Road Bunk", "Whitefield", 20, 480), charge("s2", 20, "Statiq, Indiranagar", "Bengaluru", 20, 330), charge("s3", 25, "Statiq, Indiranagar", "Bengaluru", 10, 165)],
  parked: [park(5, 30, 1.2), park(3, 20, 0.6)],
  charges: [
    { started_at: new Date(now - 2 * DAY).toISOString(), end_level: 95 },
    { started_at: new Date(now - 4 * DAY).toISOString(), end_level: 80 },
  ],
  odometerKm: 9_420,
  now,
};

// Stats > Battery.
const level = [5, 4, 3, 2, 1].map((d) => ({ at: now - d * DAY, level: d === 3 ? 95 : d === 2 ? 15 : 70 }));
const parkedLong = [park(20, 24, 0.5), park(15, 24, 0.6), park(10, 24, 0.5), park(4, 24, 3.6)];
const wakeStart = parkedLong[3].start;
const presence: DayStrip[] = [
  {
    day: 0,
    start: wakeStart,
    runs: [
      { start: wakeStart, end: wakeStart + HOUR, state: "online", seen: [] },
      { start: wakeStart + HOUR, end: wakeStart + 5 * HOUR, state: "asleep", seen: [] },
      { start: wakeStart + 5 * HOUR, end: wakeStart + 5.5 * HOUR, state: "online", seen: [] },
      { start: wakeStart + 5.5 * HOUR, end: wakeStart + 30 * HOUR, state: "asleep", seen: [] },
    ],
  },
];
const sentryOn = { SentryMode: [{ at: new Date(wakeStart - HOUR).toISOString(), value: "SentryModeStateArmed" }] };

// One drive.
const t0 = Date.parse("2026-10-26T07:14:00+05:30");
const secs = (n: number, v: (k: number) => number) => Array.from({ length: n }, (_, k) => ({ t: t0 + k * 1000, v: v(k) }));
const driveInput: DriveTipsInput = {
  km: 30,
  kwh: 5.04,
  usual: { whPerKm: 131, hard: 1 },
  moments: [
    { t: t0 + 60_000, v: -HARD_MS2 - 1, kind: "brake" },
    { t: t0 + 120_000, v: -HARD_MS2 - 1, kind: "brake" },
    { t: t0 + 180_000, v: -HARD_MS2 - 1, kind: "brake" },
    { t: t0 + 240_000, v: HARD_MS2 + 1, kind: "start" },
  ],
  power: secs(2400, (k) => (k < 1800 ? 20 : -6)),
  speed: secs(2400, (k) => (k < 300 ? 95 : 50)),
  grade: secs(120, (k) => (k < 60 ? 4 : 0)),
  legs: [{ start: t0, end: t0 + 2_400_000 }],
  usableKwh: 59,
  climate: null,
};
const climate: ClimateSummary = { totalMs: 65 * MIN, onMs: 56 * MIN, set: { low: 18, high: 18 }, insideStart: 21.9, insideEnd: 22.8, outside: { low: 28, high: 34 } };
const calm: DriveTipsInput = { ...driveInput, moments: [], usual: { whPerKm: null, hard: 0 }, speed: secs(60, () => 40), grade: [] };
const twoLegs = [
  { start: t0, end: t0 + 1_200_000 },
  { start: t0 + 1_500_000, end: t0 + 2_400_000 },
];

// Charging.
const c = (id: string, name: string, area: string | null, kwh: number, cost: number, kind: "ac" | "dc" = "dc"): PricedCharge => ({ id, at: now - DAY, name, area, kwh, cost, kind });
const priced = [c("s1", "Statiq, Indiranagar", "Bengaluru", 30, 600), c("s2", "Supercharger, Hebbal", "Bengaluru", 40, 1000), c("s3", "Home wallbox", null, 50, 450, "ac")];
const taper = { startLevel: 50, endLevel: 92, belowMs: 23 * MIN, aboveMs: 18 * MIN };

// Drive wording: a 20-minute drive, 12.3 km, 70% to 65%, with two hard brakes and a climb.
const T = Date.parse("2026-10-25T07:15:00+05:30");
const at = (seconds: number, v: number) => ({ t: T + seconds * 1000, v });
const series = (n: number, v: (k: number) => number) => Array.from({ length: n }, (_, k) => at(k, v(k)));
const trip = (over: Partial<DriveInput["trip"]> = {}): DriveInput["trip"] => ({ start: T, end: T + 20 * MIN, km: 12.3, kwh: 1.38, stops: 0, startLevel: 70, endLevel: 65, legs: [{ start: T, end: T + 20 * MIN }], ...over });
const drivePage = (over: Partial<DriveInput> = {}): DriveFacts =>
  describeDrive({
    trip: trip(),
    battery: [at(0, 70), at(1200, 65)],
    speed: series(600, (k) => 20 + (k % 40)),
    power: series(600, (k) => (k % 10 === 0 ? -8 : 15)),
    accel: [...series(100, () => 0.5), at(200, -3.5), at(300, -3.2), at(400, 1)],
    grade: [...series(60, () => 0), ...Array.from({ length: 60 }, (_, k) => at(100 + k, 5)), ...Array.from({ length: 10 }, (_, k) => at(200 + k, 0))],
    usual: { whPerKm: 107, hard: 2 },
    ...over,
  }).facts;

export const CASES: EvalCase[] = [
  tips("week-all-nmc", "week", NMC, weekFindings(weekInput), "Home's week with every finding; NMC car"),
  tips("week-all-lfp", "week", LFP, weekFindings(weekInput), "The same week for an LFP car, where charging to 100% is fine"),
  tips("week-energy-only", "week", NMC, weekFindings({ ...weekInput, priced: [], parked: [], charges: [], odometerKm: 3_000, drives: [drive(1, 30, 3.9), ...usualDrives] }), "One finding: energy use against the week before and the usual"),
  tips("week-no-previous", "week", LFP, weekFindings({ ...weekInput, driving: driving(period(80, 142, 11.4), null), priced: [], parked: [], odometerKm: 2_000 }), "Energy against the usual only, no week before"),
  tips("week-high-charges", "week", NMC, weekFindings({ ...weekInput, driving: null, drives: [], priced: [], parked: [], odometerKm: 2_000, charges: [95, 100, 92].map((end_level, k) => ({ started_at: new Date(now - (k + 1) * DAY).toISOString(), end_level })) }), "Charged above 90% three times on an NMC car; advice must stay in the hint"),
  tips("battery-all-nmc", "battery", NMC, batteryFindings({ parked: parkedLong, presence, level, avgPrice: 20, now }), "Parked loss, heavy stretch, wakes, high days and low level; no mode known"),
  tips("battery-sentry", "battery", NMC, batteryFindings({ parked: parkedLong, presence, level, avgPrice: 20, now, modes: sentryOn }), "Heavy stretch with Sentry Mode on: causes holds sentry"),
  tips("battery-lfp", "battery", LFP, batteryFindings({ parked: parkedLong, presence, level, avgPrice: 20, now }), "LFP car with a day ended above 90%"),
  tips("battery-no-price", "battery", NMC, batteryFindings({ parked: parkedLong, presence: [], level: [], avgPrice: null, now }), "No price known, so no money figures; parked loss and heavy stretch only"),
  tips("battery-levels-only", "battery", LFP, batteryFindings({ parked: [], presence: [], level, avgPrice: null, now }), "Charge level habits only, no parked data"),
  tips("drive-all", "drive_tips", NMC, driveFindings(driveInput), "Hard moments, energy use against the usual, speed and a climb; ranges worked out by code"),
  tips("drive-climate", "drive_tips", NMC, driveFindings({ ...driveInput, climate }), "AC set 10 °C below outside; causes holds climate"),
  tips("drive-calm", "drive_tips", LFP, driveFindings(calm), "A calm drive: little to say"),
  tips("drive-no-usual", "drive_tips", NMC, driveFindings({ ...driveInput, usual: { whPerKm: null, hard: null } }), "No usual yet, so nothing may be compared with one"),
  tips("drive-no-moments", "drive_tips", null, driveFindings({ ...driveInput, moments: null }), "Car sent no acceleration; car not known"),
  tips("trip-all", "trip_tips", NMC, driveFindings({ ...driveInput, legs: twoLegs }), "A trip of two drives"),
  tips("trip-climate", "trip_tips", LFP, driveFindings({ ...driveInput, legs: twoLegs, climate }), "A trip with the AC far below outside"),
  tips("trip-calm", "trip_tips", NMC, driveFindings({ ...calm, legs: [{ start: t0, end: t0 + 60_000 }] }), "A short calm trip"),
  tips("trip-with-usual", "trip_tips", LFP, driveFindings({ ...calm, speed: secs(60, () => 30), usual: { whPerKm: 120, hard: 1 } }), "Smooth trip with a usual"),
  tips("trip-no-hard", "trip_tips", NMC, driveFindings({ ...driveInput, moments: [], usual: { whPerKm: null, hard: 0 }, grade: [] }), "Speed and regen without hard moments"),
  tips("charging-all", "charging", NMC, chargingFindings({ priced, energy: { ac: 50, dc: 70 }, dcWithCurves: 4, tapered: [{ at: now, taper }] }), "A cheaper station nearby, station prices, past 80% and AC against DC"),
  tips("charging-lfp", "charging", LFP, chargingFindings({ priced, energy: { ac: 50, dc: 70 }, dcWithCurves: 4, tapered: [{ at: now, taper }] }), "The same for an LFP car"),
  tips("charging-two-stations", "charging", NMC, chargingFindings({ priced: priced.slice(1), energy: { ac: 50, dc: 40 }, dcWithCurves: 0, tapered: [] }), "A Supercharger and home charging; little to compare"),
  tips("charging-no-taper", "charging", LFP, chargingFindings({ priced, energy: { ac: 20, dc: 70 }, dcWithCurves: 0, tapered: [] }), "No charging curves, so no past-80% finding"),
  tips(
    "charging-hand",
    "charging",
    NMC,
    [hand("stationPrices", { stations: 3, cheapest: { station: "Voltway, Koramangala", price: "₹14.00/kWh" }, dearest: { station: "Supercharger, Hebbal", price: "₹25.00/kWh" }, charges: 7, paidAtTheDearest: "₹3,400.00" }, { hint: "A station that charges less per kWh costs less for the same energy." })],
    "Hand-written: many figures that tempt the model to add or divide",
  ),
  tips("charge-all", "charge", NMC, chargeFindings({ charge: priced[1], others: [priced[0], priced[2], c("s4", "Statiq, Indiranagar", "Bengaluru", 10, 210)], kind: "dc", taper }), "One DC charge: cheaper station in town, price, time past 80%"),
  tips("charge-lfp", "charge", LFP, chargeFindings({ charge: priced[1], others: [priced[0], priced[2]], kind: "dc", taper }), "The same charge on an LFP car"),
  tips("charge-ac", "charge", NMC, chargeFindings({ charge: priced[0], others: [priced[1], priced[2]], kind: "dc", taper: null }), "A DC charge cheaper than the owner's other DC charge"),
  tips("charge-no-others", "charge", LFP, chargeFindings({ charge: priced[0], others: [], kind: "dc", taper }), "A first charge: nothing to compare with except its time past 80%"),
  tips("charge-hand-nohint", "charge", NMC, [hand("thisChargePrice", { thisCharge: "₹25.00/kWh", ownersCheapest: "₹14.00/kWh", kWhAdded: "40 kWh", paid: "₹1,000.00" })], "Hand-written, no hint and no causes: one sentence of figures; tempts a saving sum"),

  { id: "wording-base", kind: "drive", facts: drivePage(), note: "Heavy against the usual, two hard brakes, one climb" },
  { id: "wording-no-usual", kind: "drive", facts: drivePage({ usual: { whPerKm: null, hard: null } }), note: "No usual: the word must not appear" },
  { id: "wording-battery-chart", kind: "drive", facts: drivePage({ trip: trip({ endLevel: 55 }), battery: [at(0, 70), at(600, 62), at(1200, 55)] }), note: "Battery fell 15 points" },
  { id: "wording-smooth", kind: "drive", facts: drivePage({ accel: series(200, () => 0.4), usual: { whPerKm: 107, hard: 0 } }), note: "No hard moments" },
  { id: "wording-flat", kind: "drive", facts: drivePage({ grade: series(200, () => 0), accel: series(200, () => 0.3) }), note: "Flat road; little explains the energy" },
  {
    id: "wording-stops",
    kind: "drive",
    facts: drivePage({
      trip: trip({
        stops: 2,
        km: 31.4,
        kwh: 4.1,
        end: T + 60 * MIN,
        legs: [
          { start: T, end: T + 20 * MIN },
          { start: T + 25 * MIN, end: T + 45 * MIN },
          { start: T + 50 * MIN, end: T + 60 * MIN },
        ],
      }),
    }),
    note: "A trip with two stops",
  },
  { id: "wording-no-kwh", kind: "drive", facts: drivePage({ trip: trip({ kwh: null }), usual: { whPerKm: null, hard: 2 } }), note: "Energy not known; only hard moments have a usual" },
  {
    id: "wording-descent",
    kind: "drive",
    facts: drivePage({ grade: [...series(60, () => 0), ...Array.from({ length: 80 }, (_, k) => at(100 + k, -6))], power: series(600, (k) => (k % 3 === 0 ? -12 : 9)) }),
    note: "A long descent with a lot of regen",
  },
];
