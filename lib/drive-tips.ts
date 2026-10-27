// The findings behind a drive page's tips (lib/ai-tips.ts): this drive against the owner's usual. Hard
// brakes and starts, what regen won back, energy use and what it means for range on a full charge, time spent
// above 80 km/h, and climbs. Pure, so tested (test/drive-tips.test.ts).
import { type Finding, IMPACT, plural, type TipSurface } from "@/lib/ai-tips";
import { type ClimateSummary, formatTempSpan, onWords } from "@/lib/drive-climate";
import { againstUsual, type HardMoment, type Point, slopes, traceEnergy } from "@/lib/drive-verdict";
import { formatCelsius, formatClock, formatDuration, formatKwh, formatNumber, formatPercent, formatRangeKm, formatSpeed } from "@/lib/format";
import { formatWhPerKm } from "@/lib/seasons";

const context = (what: "drive" | "trip") =>
  `The tips sit on one ${what}'s page, under tiles that show its energy use against the owner's usual and its hard starts and stops. Call it "this ${what}".`;

export const DRIVE_TIPS: TipSurface = { scope: "drive_tips", version: 5, context: context("drive") };
export const TRIP_TIPS: TipSurface = { scope: "trip_tips", version: 5, context: context("trip") };

// Above this speed, air drag makes each km cost noticeably more.
export const FAST_KMH = 80;
// Speed readings further apart than this are a gap, not time at that speed.
const SPEED_GAP_MS = 30_000;
// The AC on for under 2 minutes is a blip, not a habit worth a tip.
const AC_MIN_MS = 2 * 60_000;
// A set temperature this far (°C) below the coolest outside is a long way for the AC to pull the cabin down.
export const FAR_BELOW_C = 8;
// Under 3 minutes above FAST_KMH is an overtake or two, not a habit.
const FAST_MIN_MS = 3 * 60_000;

export type DriveTipsInput = {
  km: number;
  kwh: number | null;
  usual: { whPerKm: number | null; hard: number | null };
  // Null when the car sent no acceleration.
  moments: HardMoment[] | null;
  power: Point[]; // kW, regen negative
  speed: Point[]; // km/h, while moving
  grade: Point[]; // %
  legs: { start: number; end: number }[];
  // The battery's usable capacity from full to empty (the latest week's), for range on a full charge.
  usableKwh: number | null;
  // The AC and temperatures while under way (lib/drive-climate.ts); null when the car sent none.
  climate: ClimateSummary | null;
};

// Time spent above FAST_KMH: each reading holds until the next, never across a gap.
export function timeAbove(speed: Point[], kmh = FAST_KMH): number {
  let ms = 0;
  for (let k = 0; k + 1 < speed.length; k++) {
    const dt = speed[k + 1].t - speed[k].t;
    if (speed[k].v > kmh && dt > 0 && dt <= SPEED_GAP_MS) ms += dt;
  }
  return ms;
}

export function driveFindings(input: DriveTipsInput): Finding[] {
  const out: Finding[] = [];
  const energy = input.power.length >= 2 ? traceEnergy(input.power, input.legs) : null;
  const regen = energy && energy.regen >= 0.05 && energy.drawn >= 0.05 ? energy : null;

  // Hard brakes and starts against the usual, with what regen won back: easing off lets regen do the braking.
  if (input.moments && input.usual.hard !== null) {
    const brakes = input.moments.filter((m) => m.kind === "brake");
    const starts = input.moments.filter((m) => m.kind === "start");
    const usual = Number(formatNumber(input.usual.hard, 0));
    const n = input.moments.length;
    if (n > usual) {
      out.push({
        kind: "hardMoments",
        score: IMPACT.change(Math.min(100, ((n - usual) / Math.max(1, usual)) * 100)),
        facts: {
          hardMoments: n,
          hardBrakes: brakes.length,
          hardStarts: starts.length,
          usualHardMomentsPerDrive: usual,
          brakeTimes: brakes.map((m) => formatClock(m.t)),
          regenWonBack: regen ? formatKwh(regen.regen) : null,
          energyDrawn: regen ? formatKwh(regen.drawn) : null,
        },
        hint: brakes.length > 0 ? "Easing off earlier before stops lets regen win energy back." : "Gentle starts use less energy.",
        say: `This drive had ${plural(n, "hard moment")} against your usual ${usual}. Easing off earlier before stops lets regen slow the car and win energy back.`,
      });
    } else if (regen) {
      // A smooth drive: what regen did, worth knowing on its own.
      out.push({
        kind: "regen",
        score: IMPACT.info(100),
        facts: { regenWonBack: formatKwh(regen.regen), energyDrawn: formatKwh(regen.drawn), share: formatPercent((regen.regen / regen.drawn) * 100) },
        hint: "Lifting off early lets regen win back more.",
        say: `Regen won back ${formatKwh(regen.regen)} of the ${formatKwh(regen.drawn)} this drive drew. Lifting off early and smoothly wins back more.`,
      });
    }
  }

  // Energy use against the usual, and what each means in range on a full charge.
  const whPerKm = input.kwh !== null && input.km >= 1 ? (input.kwh * 1000) / input.km : null;
  if (whPerKm !== null && input.usual.whPerKm !== null) {
    const vs = againstUsual(whPerKm, input.usual.whPerKm);
    if (vs.way !== "close") {
      const usable = input.usableKwh;
      const range = (wh: number) => (usable === null ? null : formatRangeKm((usable * 1000) / wh));
      out.push({
        kind: "energyUse",
        score: IMPACT.change(Number.parseFloat(vs.by)),
        facts: {
          thisDrive: formatWhPerKm(whPerKm),
          usual: formatWhPerKm(input.usual.whPerKm),
          compared: `${vs.by} ${vs.way === "better" ? "less" : "more"} than usual`,
          fullChargeAtThisDrivesUse: range(whPerKm),
          fullChargeAtUsualUse: range(input.usual.whPerKm),
        },
        say:
          usable === null
            ? `This drive used ${formatWhPerKm(whPerKm)}, against your usual ${formatWhPerKm(input.usual.whPerKm)}.`
            : `At this drive's ${formatWhPerKm(whPerKm)}, a full charge would go about ${range(whPerKm)}, against ${range(input.usual.whPerKm)} at your usual ${formatWhPerKm(input.usual.whPerKm)}.`,
      });
    }
  }

  // Time above 80 km/h.
  const fast = timeAbove(input.speed);
  if (fast >= FAST_MIN_MS) {
    const top = Math.max(...input.speed.map((p) => p.v));
    out.push({
      kind: "speed",
      score: IMPACT.info(500 + fast / 60_000),
      facts: { topSpeed: formatSpeed(top), timeAbove80: formatDuration(fast / 1000), above: formatSpeed(FAST_KMH) },
      hint: "Above 80 km/h, air drag makes each km cost more.",
      causes: ["speed"],
      say: `This drive spent ${formatDuration(fast / 1000)} above ${formatSpeed(FAST_KMH)}, with a top of ${formatSpeed(top)}. Air drag rises quickly above that, so a little slower goes further.`,
    });
  }

  // Climbs: they take energy that regen only partly wins back on the way down.
  if (input.grade.length >= 2) {
    const { climbs, descents } = slopes(input.grade);
    if (climbs.length > 0) {
      const steepest = climbs.reduce((a, s) => (s.v > a.v ? s : a));
      out.push({
        kind: "climbs",
        score: IMPACT.info(200 + climbs.length),
        facts: { climbs: climbs.length, steepest: formatPercent(steepest.v), steepestAt: formatClock(steepest.t), descents: descents.length },
        hint: "Climbs take extra energy, and regen wins some back downhill.",
        say: `This drive had ${plural(climbs.length, "climb")}, the steepest ${formatPercent(steepest.v)} at ${formatClock(steepest.t)}. Climbs take extra energy, and regen wins some back on the way down.`,
      });
    }
  }

  // The AC: what it was set to against the weather outside. Only physics in the hint, as the car doesn't say
  // how much energy the AC took.
  const ac = climateFinding(input.climate);
  if (ac) out.push(ac);
  return out;
}

function climateFinding(c: ClimateSummary | null): Finding | null {
  if (!c || c.onMs === null || c.onMs < AC_MIN_MS || !c.set) return null;
  const set = formatTempSpan(c.set.low, c.set.high);
  const outside = c.outside ? formatTempSpan(c.outside.low, c.outside.high) : null;
  // The warmest setting against the coolest outside: the gap is never overstated.
  const below = c.outside ? c.outside.low - c.set.high : null;
  const gap = below !== null && below >= FAR_BELOW_C ? below : null;
  return {
    kind: "climate",
    score: gap !== null ? IMPACT.change(Math.min(100, gap * 5)) : IMPACT.info(250),
    facts: {
      acOn: onWords(c),
      setTemperature: set,
      insideAtStart: c.insideStart === null ? null : formatCelsius(c.insideStart),
      insideAtEnd: c.insideEnd === null ? null : formatCelsius(c.insideEnd),
      outside,
      setBelowOutside: gap !== null ? formatCelsius(gap) : null,
    },
    hint: "A slightly warmer set point makes the AC work less.",
    causes: ["climate"],
    say:
      gap !== null
        ? `The AC was set to ${set}, ${formatCelsius(gap)} below the ${outside} outside. A slightly warmer set point makes it work less.`
      : outside
        ? `The AC was set to ${set} with ${outside} outside. A slightly warmer set point makes it work less.`
        : `The AC was set to ${set}. A slightly warmer set point makes it work less.`,
  };
}
