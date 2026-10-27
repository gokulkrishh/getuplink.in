// What the drive page says about a drive, in one place: the charts it shows, the code sentences
// (lib/drive-verdict.ts), and the facts the AI wording is written from (lib/drive-wording.ts). Pure, so the
// facts are tested (test/drive-facts.test.ts). The facts hold only figures, already formatted as the page
// shows them, and clock times: never a coordinate, a place name, a VIN or any other identifier.
import {
  accelVerdict,
  againstUsual,
  batteryVerdict,
  driveVerdict,
  gradeVerdict,
  hardMoments,
  isFlat,
  type HardMoment,
  type Point,
  powerVerdict,
  slopes,
  speedSpread,
  speedVerdict,
  traceEnergy,
} from "@/lib/drive-verdict";
import { formatClock, formatDuration, formatKm, formatKw, formatKwh, formatNumber, formatPercent } from "@/lib/format";
import { formatWhPerKm } from "@/lib/seasons";

// The battery chart shows only when the level fell by at least this many points; otherwise its tile says it.
export const BATTERY_CHART_POINTS = 10;

// The parts of a drive's detail (lib/server/drive-detail.ts) the words come from.
export type DriveInput = {
  trip: {
    start: number;
    end: number;
    km: number;
    kwh: number | null;
    stops: number;
    startLevel: number | null;
    endLevel: number | null;
    legs: { start: number; end: number }[];
  };
  battery: Point[];
  speed: Point[];
  power: Point[]; // kW
  accel: Point[]; // m/s²
  grade: Point[]; // %
  usual: { whPerKm: number | null; hard: number | null };
};

// The lines under each chart, by chart. The summary is "How this drive went".
export const CHART_LINES = ["speed", "power", "acceleration", "grade", "battery"] as const;
export type ChartLine = (typeof CHART_LINES)[number];
export type WordingField = "summary" | ChartLine;

type Slope = { count: number; steepest: string; at: string };

export type DriveFacts = {
  kind: "drive" | "trip";
  started: string; // "7:15 AM"
  ended: string;
  took: string; // "24 min"
  stops: number;
  distance: string; // "12.3 km"
  energyUsed: string | null; // the battery's own figure, "1.8 kWh"
  // Wh/km and, once there are enough other drives, the owner's usual and how this one compares.
  efficiency: { whPerKm: string; usual: string | null; vsUsual: { way: "better" | "worse" | "close"; by: string } | null } | null;
  // Hard starts and brakes (lib/drive-verdict.ts HARD_G), with their clock times, against the usual count a drive.
  hard: { brakes: number; starts: number; brakeTimes: string[]; startTimes: string[]; usual: number | null; vsUsual: "no more than usual" | "more than usual" | null } | null;
  battery: { start: string; end: string; used: string | null; chargedOnTheWay: boolean } | null;
  // One entry per chart the page shows, each only then.
  speed: { top: string; mostly: string | null } | null;
  power: { drawn: string; regen: string | null; regenShare: string | null; peak: string } | null;
  grade: { flat: boolean; climbs: Slope | null; descents: Slope | null } | null;
  // The charts to write a line for, in page order.
  charts: ChartLine[];
};

export type DriveWords = Partial<Record<WordingField, string>>;

export type DriveView = {
  facts: DriveFacts;
  // The code sentences: what the page shows unless AI wording passed its checks.
  code: DriveWords;
  moments: HardMoment[] | null;
  // The battery readings its chart draws; empty when the chart doesn't show.
  batteryShown: Point[];
};

function slopeFacts(list: { t: number; v: number }[]): Slope | null {
  if (list.length === 0) return null;
  const top = list.reduce((a, s) => (Math.abs(s.v) > Math.abs(a.v) ? s : a));
  return { count: list.length, steepest: formatPercent(Math.abs(top.v)), at: formatClock(top.t) };
}

// Everything the page says about the drive, from its detail.
export function describeDrive(input: DriveInput): DriveView {
  const { trip, speed, power, accel, grade, usual } = input;
  const inDrive = input.battery.filter((p) => p.t <= trip.end);
  const levels = inDrive.map((p) => p.v);
  const batteryShown = levels.length >= 2 && Math.max(...levels) - Math.min(...levels) >= BATTERY_CHART_POINTS ? inDrive : [];
  const moments = accel.length >= 2 ? hardMoments(accel) : null;
  const whPerKm = trip.kwh !== null && trip.km >= 1 ? (trip.kwh * 1000) / trip.km : null;

  const shown: Record<ChartLine, boolean> = {
    speed: speed.length >= 2,
    power: power.length >= 2,
    acceleration: accel.length >= 2,
    grade: grade.length >= 2,
    battery: batteryShown.length >= 2,
  };
  const verdict = driveVerdict({ whPerKm, usual: usual.whPerKm, moments, usualHard: usual.hard });
  const went = [verdict.efficiency, verdict.smoothness].filter(Boolean).join(" ");
  const code: DriveWords = {
    ...(went ? { summary: went } : {}),
    ...(shown.speed ? { speed: speedVerdict(speed) ?? undefined } : {}),
    ...(shown.power ? { power: powerVerdict(power, trip.legs) ?? undefined } : {}),
    ...(shown.acceleration ? { acceleration: accelVerdict(moments ?? []) } : {}),
    ...(shown.grade ? { grade: gradeVerdict(grade) ?? undefined } : {}),
    ...(shown.battery ? { battery: batteryVerdict(trip.startLevel, trip.endLevel, trip.km) ?? undefined } : {}),
  };
  // Only lines the page would show a code sentence for: the AI never fills a line the code leaves empty.
  const charts = CHART_LINES.filter((c) => shown[c] && code[c]);

  const energy = shown.power ? traceEnergy(power, trip.legs) : null;
  const brakes = moments?.filter((m) => m.kind === "brake") ?? [];
  const starts = moments?.filter((m) => m.kind === "start") ?? [];
  const nHard = moments?.length ?? 0;
  const drivingSlopes = shown.grade ? slopes(grade) : null;
  const facts: DriveFacts = {
    kind: trip.stops ? "trip" : "drive",
    started: formatClock(trip.start),
    ended: formatClock(trip.end),
    took: formatDuration((trip.end - trip.start) / 1000),
    stops: trip.stops,
    distance: formatKm(trip.km),
    energyUsed: trip.kwh !== null ? formatKwh(trip.kwh) : null,
    efficiency:
      whPerKm === null
        ? null
        : { whPerKm: formatWhPerKm(whPerKm), usual: usual.whPerKm === null ? null : formatWhPerKm(usual.whPerKm), vsUsual: usual.whPerKm === null ? null : againstUsual(whPerKm, usual.whPerKm) },
    hard:
      moments === null
        ? null
        : {
            brakes: brakes.length,
            starts: starts.length,
            brakeTimes: brakes.map((m) => formatClock(m.t)),
            startTimes: starts.map((m) => formatClock(m.t)),
            usual: usual.hard === null ? null : Number(formatNumber(usual.hard, 0)),
            vsUsual: usual.hard === null ? null : nHard <= usual.hard ? "no more than usual" : "more than usual",
          },
    battery:
      trip.startLevel === null || trip.endLevel === null
        ? null
        : {
            start: formatPercent(trip.startLevel),
            end: formatPercent(trip.endLevel),
            used: trip.startLevel > trip.endLevel ? formatPercent(trip.startLevel - trip.endLevel) : null,
            chargedOnTheWay: trip.endLevel > trip.startLevel,
          },
    speed: shown.speed ? speedSpread(speed) : null,
    power:
      energy === null
        ? null
        : {
            drawn: formatKwh(energy.drawn),
            regen: energy.regen >= 0.05 ? formatKwh(energy.regen) : null,
            regenShare: energy.regen >= 0.05 && energy.drawn >= 0.05 ? formatPercent((energy.regen / energy.drawn) * 100) : null,
            peak: formatKw(Math.max(...power.map((p) => p.v))),
          },
    grade: drivingSlopes === null ? null : { flat: isFlat(grade), climbs: slopeFacts(drivingSlopes.climbs), descents: slopeFacts(drivingSlopes.descents) },
    charts,
  };
  return { facts, code, moments, batteryShown };
}
