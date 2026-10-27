// The findings behind Stats > Battery's tips (lib/ai-tips.ts), from what the car did while parked and where
// its charge level sat: what parking cost a day against the usual, how often it woke, a stretch that drew far
// more than usual, and days that ended above 90%. Sentry Mode, Climate Keeper or Cabin Overheat Protection is
// named only when the car reported it on while parked (lib/parked-modes.ts), never as a guess. The page has a period switch, so no finding names a period.
// Pure, so tested (test/battery-tips.test.ts).
import { type Finding, IMPACT, type TipSurface } from "@/lib/ai-tips";
import type { DayStrip } from "@/lib/awake";
import { perKwh } from "@/lib/charge-tips";
import type { LevelPoint } from "@/lib/charge-level";
import type { ParkedPeriod } from "@/lib/drives";
import { type ModeReadings, type ModeTimes, modesWhileParked, sumModes } from "@/lib/parked-modes";
import { formatClock, formatDuration, formatKwh, formatMoney, formatNumber, formatPercent, formatPower, formatShortDate } from "@/lib/format";
import { istDay, median } from "@/lib/telemetry-derive";

export const BATTERY_TIPS: TipSurface = {
  scope: "battery",
  version: 2,
  noPeriod: true,
  context:
    "The tips sit at the top of the Battery page, above charts of the battery level and what the car lost while parked. Don't name a period such as \"this week\": the page's period switch shows that.",
};

const DAY = 86_400_000;
// A stretch drawing at least this many times the usual, and at least HEAVY_W, is heavy.
const HEAVY_TIMES = 2;
const HEAVY_W = 60;
// A day ending above this level is a high day.
const HIGH_LEVEL = 90;
// A lowest level under this is worth a word.
const LOW_LEVEL = 20;
// The latest stretches against the usual: those that started in the last RECENT_DAYS.
const RECENT_DAYS = 7;

export type BatteryInput = {
  // Stretches parked, oldest first (lib/drives.ts parkedDrain).
  parked: ParkedPeriod[];
  // Online, asleep and unknown per IST day (lib/awake.ts awakeDays); empty when not read.
  presence: DayStrip[];
  // Battery level points (lib/charge-level.ts), oldest first.
  level: LevelPoint[];
  // What the owner pays per kWh on average, from their bills, or null with none.
  avgPrice: number | null;
  now: number;
  // Only a heavy stretch that started from here counts (Home's week); the usual is still from them all.
  heavyFrom?: number;
  // The modes the car reported while parked; without them, no tip names one.
  modes?: ModeReadings;
};

// Under this, a mode's time on isn't worth naming.
const MODE_MIN_MS = 30 * 60_000;

// The modes that were on for a while, as facts and causes a tip may name.
function modeFacts(times: ModeTimes | null): { facts: Record<string, string>; causes: NonNullable<Finding["causes"]>; hint?: string } {
  if (!times) return { facts: {}, causes: [] };
  const on = ([
    ["sentry", "sentryModeOnWhileParked", times.sentryMs, "Sentry Mode"],
    ["climateKeeper", "climateKeeperOnWhileParked", times.keeperMs, "Climate Keeper"],
    ["overheat", "cabinOverheatProtectionOnWhileParked", times.overheatMs, "Cabin Overheat Protection"],
  ] as const).filter(([, , ms]) => ms >= MODE_MIN_MS);
  if (on.length === 0) return { facts: {}, causes: [] };
  return {
    facts: Object.fromEntries(on.map(([, key, ms]) => [key, formatDuration(ms / 1000)])),
    causes: on.map(([cause]) => cause),
    hint: `${on.map(([, , , name]) => name).join(" and ")} keep${on.length === 1 ? "s" : ""} the car awake while on, which uses energy.`,
  };
}

const rupees = (value: number) => formatMoney(value, "INR");

// The car's wakes while parked: online stretches that began inside a parked stretch, with the time online.
export function parkedWakes(parked: ParkedPeriod[], presence: DayStrip[]): { wakes: number; awakeMs: number; parkedMs: number } | null {
  const runs = presence.flatMap((d) => d.runs);
  const known = runs.filter((r) => r.state !== "unknown");
  if (known.length === 0) return null;
  const covered = { from: Math.min(...known.map((r) => r.start)), to: Math.max(...known.map((r) => r.end)) };
  let wakes = 0;
  let awakeMs = 0;
  let parkedMs = 0;
  for (const p of parked) {
    const [from, to] = [Math.max(p.start, covered.from), Math.min(p.end, covered.to)];
    if (to <= from) continue;
    parkedMs += to - from;
    // An online run already under way when the car parked is the drive's tail, not a wake.
    for (const r of runs) {
      if (r.state !== "online" || r.start <= from || r.start >= to) continue;
      wakes += 1;
      awakeMs += Math.min(r.end, to) - r.start;
    }
  }
  return parkedMs >= DAY ? { wakes, awakeMs, parkedMs } : null;
}

// What parking cost a day, over a list of stretches with an energy figure.
function perDay(list: ParkedPeriod[]) {
  const withKwh = list.filter((p) => p.kwh !== null && p.hours > 0);
  const hours = withKwh.reduce((s, p) => s + p.hours, 0);
  if (hours < 12) return null;
  return { kwh: (withKwh.reduce((s, p) => s + p.kwh!, 0) / hours) * 24, percent: (list.reduce((s, p) => s + p.lostPercent, 0) / list.reduce((s, p) => s + p.hours, 0)) * 24 };
}

export function batteryFindings(input: BatteryInput): Finding[] {
  const { parked, avgPrice, now } = input;
  const out: Finding[] = [];
  const cost = (kwh: number) => (avgPrice === null ? null : kwh * avgPrice);

  // What parking cost a day, the latest stretches against all of them.
  const all = perDay(parked);
  const recent = perDay(parked.filter((p) => p.start >= now - RECENT_DAYS * DAY));
  if (all && all.kwh >= 0.1) {
    const shown = recent ?? all;
    const usual = recent && parked.length >= 3 ? median(parked.map((p) => p.percentPerDay)) : null;
    const rupeesPerDay = cost(shown.kwh);
    const stretches = recent ? parked.filter((p) => p.start >= now - RECENT_DAYS * DAY) : parked;
    const modes = modeFacts(input.modes ? sumModes(stretches.map((p) => modesWhileParked(p, input.modes!))) : null);
    out.push({
      kind: "parkedLoss",
      score: rupeesPerDay !== null ? IMPACT.saves(rupeesPerDay * 7) : IMPACT.change(shown.percent * 10),
      facts: {
        lostPerDayParked: formatKwh(shown.kwh),
        lostPerDayParkedPercent: formatPercent(shown.percent, 1),
        costPerDayParked: rupeesPerDay === null ? null : rupees(rupeesPerDay),
        atWhatYouPay: avgPrice === null ? null : perKwh(avgPrice),
        usualPercentPerDay: usual === null ? null : formatPercent(usual, 1),
        ...modes.facts,
      },
      ...(modes.hint ? { hint: modes.hint, causes: modes.causes } : {}),
      say: `Parked, your car loses about ${formatKwh(shown.kwh)} a day (${formatPercent(shown.percent, 1)})${rupeesPerDay === null ? "" : `, ${rupees(rupeesPerDay)} at what you pay`}.`,
    });
  }

  // The heaviest stretch, when it drew far more than the usual.
  const drawing = parked.filter((p) => p.watts !== null && p.kwh !== null);
  const candidates = drawing.filter((p) => p.start >= (input.heavyFrom ?? -Infinity));
  if (drawing.length >= 3 && candidates.length > 0) {
    const usualW = median(drawing.map((p) => p.watts!));
    const heavy = candidates.reduce((a, p) => (p.watts! > a.watts! ? p : a));
    if (heavy.watts! >= HEAVY_TIMES * usualW && heavy.watts! >= HEAVY_W) {
      const kwhPerDay = (heavy.kwh! / heavy.hours) * 24;
      const extraPerDay = ((heavy.watts! - usualW) * 24) / 1000;
      const extraCost = cost(extraPerDay);
      const modes = modeFacts(input.modes ? modesWhileParked(heavy, input.modes) : null);
      out.push({
        kind: "heavyDrain",
        score: extraCost !== null ? IMPACT.saves(extraCost * 7) : IMPACT.change(Math.min(200, (heavy.watts! / usualW) * 25)),
        facts: {
          parkedFrom: `${formatShortDate(heavy.start)}, ${formatClock(heavy.start)}`,
          parkedFor: formatDuration(heavy.hours * 3600),
          drew: formatPower(heavy.watts!),
          usuallyDraws: formatPower(usualW),
          lostPerDayThen: formatKwh(kwhPerDay),
          extraPerDay: formatKwh(extraPerDay),
          extraCostPerDay: extraCost === null ? null : rupees(extraCost),
          // Only the time it was seen sending data: the real time may be longer.
          seenAwake: `at least ${formatDuration(heavy.awakeMs / 1000)}`,
          ...modes.facts,
        },
        ...(modes.hint ? { hint: modes.hint, causes: modes.causes } : {}),
        say: `Parked from ${formatShortDate(heavy.start)}, ${formatClock(heavy.start)}, the car drew ${formatPower(heavy.watts!)} against its usual ${formatPower(usualW)}, about ${extraCost === null ? formatKwh(extraPerDay) : rupees(extraCost)} a day more.`,
      });
    }
  }

  // How often the car woke while parked.
  const woke = parkedWakes(parked, input.presence);
  if (woke && woke.wakes > 0) {
    const days = woke.parkedMs / DAY;
    const wakesPerDay = woke.wakes / days;
    if (wakesPerDay >= 1) {
      out.push({
        kind: "wakes",
        score: IMPACT.change(Math.min(100, wakesPerDay * 10)),
        // Only the time it was seen sending data: the real time may be longer.
        facts: { wakesPerDayParked: formatNumber(wakesPerDay, 1), seenAwakePerDay: `at least ${formatDuration(woke.awakeMs / days / 1000)}` },
        say: `Parked, the car woke about ${formatNumber(wakesPerDay, 1)} times a day and was awake at least ${formatDuration(woke.awakeMs / days / 1000)} a day.`,
      });
    }
  }

  // Days that ended above 90%, and the lowest level.
  const lastOfDay = new Map<number, number>();
  for (const p of input.level) if (istDay(p.at) < istDay(now)) lastOfDay.set(istDay(p.at), p.level);
  const days = [...lastOfDay.values()];
  const high = days.filter((v) => v > HIGH_LEVEL).length;
  if (days.length >= 3 && high > 0) {
    out.push({
      kind: "highDays",
      score: IMPACT.change(Math.min(100, (high / days.length) * 100)),
      facts: { daysEndedAbove90: high, days: days.length },
      hint: "Tesla suggests a daily limit of 90% or less.",
      say: `${high} of ${days.length} days ended above 90%. For everyday driving, Tesla suggests a limit of 90% or less.`,
    });
  }
  if (input.level.length > 0) {
    const lowest = input.level.reduce((a, p) => (p.level < a.level ? p : a));
    if (lowest.level < LOW_LEVEL) {
      out.push({
        kind: "lowestLevel",
        score: IMPACT.info(300 + (LOW_LEVEL - lowest.level)),
        facts: { lowestLevel: formatPercent(lowest.level), on: formatShortDate(lowest.at) },
        hint: "Charging a little sooner leaves room for a detour.",
        say: `The battery got down to ${formatPercent(lowest.level)} on ${formatShortDate(lowest.at)}. Charging a little sooner leaves room for a detour.`,
      });
    }
  }
  return out;
}
