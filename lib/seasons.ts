import { timeframeEfficiency } from "@/lib/drive-stats";
import { DRIVE_DAYS, type Drive } from "@/lib/drives";
import { type DrivingCounters, type DrivingFigure, drivingTimeframe } from "@/lib/driving-figures";
import { monthIndex, monthShort, monthStart, type Slot, type Timeframe, yearOf } from "@/lib/periods";

// Efficiency by Indian season: Winter Dec to Feb, Summer Mar to May, Monsoon Jun to Sep, Post-monsoon Oct
// and Nov, by IST month. Each season's Wh/km is built from the same per-month figures as the monthly bars
// (the counters, with the drives where they cover the month; see timeframeEfficiency), so the two agree.
// Pure: lib/server/driving.ts reads the counters.

export type Season = "winter" | "summer" | "monsoon" | "postMonsoon";

// `start` is the month (0-11) a season begins, `length` its months. `after` ends "Comparison appears once
// you've driven in …".
const SEASONS: Record<Season, { name: string; words: string; after: string; start: number; length: number }> = {
  winter: { name: "Winter", words: "winter", after: "winter", start: 11, length: 3 },
  summer: { name: "Summer", words: "summer", after: "summer", start: 2, length: 3 },
  monsoon: { name: "Monsoon", words: "monsoon", after: "the monsoon", start: 5, length: 4 },
  postMonsoon: { name: "Post-monsoon", words: "post-monsoon", after: "the post-monsoon months", start: 9, length: 2 },
};
const ORDER: Season[] = ["winter", "summer", "monsoon", "postMonsoon"];

export const seasonName = (s: Season) => SEASONS[s].name;

// The season of a month index (year * 12 + month, see monthIndex).
export function seasonOfMonth(index: number): Season {
  const m = index % 12;
  return m === 11 || m <= 1 ? "winter" : m <= 4 ? "summer" : m <= 8 ? "monsoon" : "postMonsoon";
}

// The season an instant falls in, by its IST month.
export const seasonOf = (at: number) => seasonOfMonth(monthIndex(at));

// The month index a season's run begins in, for any month in it: December for Jan and Feb.
export function seasonStart(index: number): number {
  const { start } = SEASONS[seasonOfMonth(index)];
  return index - ((index % 12) - start + 12) % 12;
}

const SEASONS_SHOWN = 4;

// One bar per IST month, from the start of the season three before this one to this month (no months
// ahead): the last four seasons, a year at most. The months are the slots, so the counters are read at
// each month's edges, like the monthly bars.
export function seasonTimeframe(now: number): Timeframe {
  const cur = monthIndex(now);
  let first = seasonStart(cur);
  for (let k = 1; k < SEASONS_SHOWN; k++) first = seasonStart(first - 1);
  const slots: Slot[] = Array.from({ length: cur - first + 1 }, (_, k) => ({
    id: monthStart(first + k),
    label: monthShort(first + k),
    from: monthStart(first + k),
    to: monthStart(first + k + 1),
    isCurrent: first + k === cur,
    ahead: false,
  }));
  return { span: { from: monthStart(first), to: Infinity }, previous: null, previousLabel: null, slots, slotName: "month", title: "Last four seasons", words: "in the last four seasons" };
}

// One run of a season, like Monsoon Jun to Sep 2026, with the months in it that had a Wh/km figure.
// `first` and `last` are those months (month indexes); `current` says the season is still going.
// `km` is the distance the energy was measured over (see seasonTotals), not the odometer's.
export type SeasonFigure = { season: Season; start: number; first: number; last: number; current: boolean; whPerKm: number; kwh: number; km: number };

// `drivesFrom` is the first month whose energy comes from the drives (driving only); months before it use
// the lifetime counter, which counts energy used while parked too. Null when every month is one or the other.
export type SeasonEfficiency = { seasons: SeasonFigure[]; drivesFrom: number | null };

// Each season's Wh/km from its months, weighted by the distance each month's energy was measured over
// (kWh * 1000 / Wh/km), never a plain mean of the months. Seasons without a month with a figure are left
// out: nothing is estimated or filled in. Oldest first.
export function seasonTotals(months: { index: number; figure: DrivingFigure }[], now: number): SeasonFigure[] {
  const cur = monthIndex(now);
  const out = new Map<number, SeasonFigure>();
  for (const { index, figure } of months) {
    const { whPerKm, kwh } = figure;
    if (whPerKm === null || kwh === null || whPerKm <= 0) continue;
    const start = seasonStart(index);
    const km = (kwh * 1000) / whPerKm;
    const s = out.get(start);
    if (!s) {
      out.set(start, { season: seasonOfMonth(index), start, first: index, last: index, current: start === seasonStart(cur), whPerKm, kwh, km });
      continue;
    }
    s.first = Math.min(s.first, index);
    s.last = Math.max(s.last, index);
    s.kwh += kwh;
    s.km += km;
    s.whPerKm = (s.kwh * 1000) / s.km;
  }
  return [...out.values()].sort((a, b) => a.start - b.start);
}

// The figures for the last four seasons from the counters read at seasonTimeframe's instants, and the
// drives Uplink rebuilt (all of them, not a page's worth: the months they cover are filled from them).
export function seasonEfficiency(input: DrivingCounters, frame: Timeframe, drives: Drive[], now: number): SeasonEfficiency {
  // When tracking began: the earlier first odometer reading, as drivingFigures' `since`.
  const firsts = [input.odometer?.first?.at, input.polledOdometer?.first?.at].filter((t): t is number => t !== undefined);
  const since = firsts.length > 0 ? Math.min(...firsts) : null;
  const period = timeframeEfficiency(drivingTimeframe(input, frame, now), frame, drives, since, now);
  const months = frame.slots.map((slot, k) => ({ index: monthIndex(slot.from), figure: period.bars[k] }));
  const seasons = seasonTotals(months, now);
  // Mirrors timeframeEfficiency's rule for which months the drives cover.
  const windowFrom = now - DRIVE_DAYS * 86_400_000;
  const fromDrives = (index: number) => monthStart(index) >= windowFrom || (since !== null && since >= windowFrom);
  const counted = months.filter((m) => m.figure.whPerKm !== null);
  const firstFromDrives = counted.find((m) => fromDrives(m.index));
  const mixed = firstFromDrives !== undefined && counted.some((m) => !fromDrives(m.index)) && seasons.length > 1;
  return { seasons, drivesFrom: mixed ? firstFromDrives.index : null };
}

const whFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
export const formatWhPerKm = (wh: number) => `${whFormat.format(Math.round(wh))} Wh/km`;

// "Dec 2025 to Feb 2026", "Mar to May 2026", "Oct 2026": the months a season's figure covers; "so far"
// while it is still going.
export function seasonMonths(s: SeasonFigure): string {
  const year = (i: number) => String(yearOf(i));
  const range =
    s.first === s.last
      ? `${monthShort(s.first)} ${year(s.first)}`
      : yearOf(s.first) === yearOf(s.last)
        ? `${monthShort(s.first)} to ${monthShort(s.last)} ${year(s.last)}`
        : `${monthShort(s.first)} ${year(s.first)} to ${monthShort(s.last)} ${year(s.last)}`;
  return s.current ? `${range} so far` : range;
}

// "158 Wh/km in summer, 171 Wh/km in monsoon", oldest first.
export function seasonSentence(seasons: SeasonFigure[]): string {
  return seasons.map((s) => `${formatWhPerKm(s.whPerKm)} in ${SEASONS[s.season].words}`).join(", ");
}

// The most against the least: "Monsoon used 8% more energy per km than summer." Within 2% of each other,
// "About the same in every season." Null with fewer than two seasons.
export function seasonComparison(seasons: SeasonFigure[]): string | null {
  if (seasons.length < 2) return null;
  const most = seasons.reduce((a, b) => (b.whPerKm > a.whPerKm ? b : a));
  const least = seasons.reduce((a, b) => (b.whPerKm < a.whPerKm ? b : a));
  const pct = Math.round(((most.whPerKm - least.whPerKm) / least.whPerKm) * 100);
  if (pct <= 2) return seasons.length === 2 ? "About the same in both seasons." : "About the same in every season.";
  return `${SEASONS[most.season].name} used ${pct}% more energy per km than ${SEASONS[least.season].words}.`;
}

// With one season of figures, what the comparison waits for: the next season in calendar order.
export function seasonWaiting(season: Season): string {
  const next = ORDER[(ORDER.indexOf(season) + 1) % ORDER.length];
  return `Comparison appears once you've driven in ${SEASONS[next].after}.`;
}
