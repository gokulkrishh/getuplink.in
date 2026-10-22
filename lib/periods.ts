import { formatDate, formatShortDate } from "@/lib/format";
import { istDay, istDayStart } from "@/lib/telemetry-derive";

// Pure period maths for the home page and the Stats pages: which instants a period covers, the bars it
// draws and the span it is compared with. Everything is in IST, never server-local date getters.

export type Period = "week" | "month" | "year" | "all";

export const PERIOD_ORDER: Period[] = ["week", "month", "year", "all"];

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
export const WEEK_DAYS = 7;

// ---- Months ----

const istParts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "numeric" });
const shortMonth = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "Asia/Kolkata" });
const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "Asia/Kolkata" });

// Months are counted as year * 12 + month (0-11) in IST.
export function monthIndex(value: string | number | Date): number {
  const parts = istParts.formatToParts(new Date(value));
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return part("year") * 12 + part("month") - 1;
}

export const yearOf = (index: number) => Math.floor(index / 12);

// Noon UTC on the 15th falls in the same IST month in any timezone.
function monthDate(index: number): Date {
  return new Date(Date.UTC(yearOf(index), index % 12, 15, 12));
}

export const monthShort = (index: number) => shortMonth.format(monthDate(index));
// The instant an IST month starts.
export const monthStart = (index: number) => Date.UTC(yearOf(index), index % 12, 1) - IST_OFFSET_MS;

// Which months a period covers, given the current month index. For data kept per month; Week is the
// current month, as close as monthly data gets.
export function inPeriod(period: Period, index: number, cur: number): boolean {
  if (period === "month" || period === "week") return index === cur;
  if (period === "year") return yearOf(index) === yearOf(cur);
  return true;
}

// ---- Spans ----

// [from, to) as instants. A period runs to Infinity: nothing is dated after now, and a counter's last
// value before Infinity is its latest.
export type Span = { from: number; to: number };

export const inSpan = (at: number, span: Span) => at >= span.from && at < span.to;

// The period so far: the last 7 IST days (today included), this month, this year, or everything.
export function periodSpan(period: Period, now: number): Span {
  const cur = monthIndex(now);
  if (period === "week") return { from: istDayStart(istDay(now) - WEEK_DAYS + 1), to: Infinity };
  if (period === "month") return { from: monthStart(cur), to: Infinity };
  if (period === "year") return { from: monthStart(yearOf(cur) * 12), to: Infinity };
  return { from: -Infinity, to: Infinity };
}

// What a period is compared with: the 7 days before for Week; otherwise the period before, to date, as far
// into it as now is into this one (1–22 Sept on 22 Oct), or all of it when it is shorter. Null for All.
export function previousSpan(period: Period, now: number): Span | null {
  if (period === "all") return null;
  const { from } = periodSpan(period, now);
  if (period === "week") return { from: from - WEEK_DAYS * DAY_MS, to: from };
  const cur = monthIndex(now);
  const start = monthStart(period === "month" ? cur - 1 : (yearOf(cur) - 1) * 12);
  return { from: start, to: Math.min(from, start + (now - from)) };
}

// The previous span in words, for "96 km more than 1–22 Sept": "the 7 days before", "1–22 Sept",
// "1 Jan–22 Oct 2025". Null for All.
export function previousLabel(period: Period, now: number): string | null {
  const span = previousSpan(period, now);
  if (!span) return null;
  if (period === "week") return "the 7 days before";
  // The span ends just before `to`; on the 1st it is that one day.
  const last = span.to - 1;
  if (istDay(last) === istDay(span.from)) return period === "month" ? formatShortDate(span.from) : formatDate(span.from);
  const firstDay = formatShortDate(span.from).split(" ")[0];
  if (period === "month") return `${firstDay}–${formatShortDate(last)}`;
  return `${formatShortDate(span.from)}–${formatDate(last)}`;
}

// ---- Bars ----

// One bar: the instants it covers and its label. Its id is its start, unique within a period.
export type Slot = { id: number; label: string; from: number; to: number; isCurrent: boolean };

// The bars a period draws: the last 7 days (Week), the last 6 months (Month, so the half-year shape stays),
// the 12 months of this year (Year), or 6 years (All).
export function slotsFor(period: Period, now: number): Slot[] {
  const cur = monthIndex(now);
  const month = (index: number): Slot => ({
    id: monthStart(index),
    label: monthShort(index),
    from: monthStart(index),
    to: monthStart(index + 1),
    isCurrent: index === cur,
  });
  if (period === "week") {
    const today = istDay(now);
    return Array.from({ length: WEEK_DAYS }, (_, k) => {
      const day = today - WEEK_DAYS + 1 + k;
      return { id: istDayStart(day), label: weekday.format(istDayStart(day) + DAY_MS / 2), from: istDayStart(day), to: istDayStart(day + 1), isCurrent: day === today };
    });
  }
  if (period === "year") return Array.from({ length: 12 }, (_, m) => month(yearOf(cur) * 12 + m));
  if (period === "all") {
    return Array.from({ length: 6 }, (_, k) => {
      const year = yearOf(cur) - 5 + k;
      return { id: monthStart(year * 12), label: String(year), from: monthStart(year * 12), to: monthStart((year + 1) * 12), isCurrent: year === yearOf(cur) };
    });
  }
  return Array.from({ length: 6 }, (_, k) => month(cur - 5 + k));
}

// Totals of dated items per slot, in slot order. Items outside every slot are left out.
export function sumBySlot<T>(items: T[], slots: Slot[], at: (item: T) => number, value: (item: T) => number): number[] {
  const sums = slots.map(() => 0);
  for (const item of items) {
    const t = at(item);
    const k = slots.findIndex((s) => inSpan(t, s));
    if (k >= 0) sums[k] += value(item);
  }
  return sums;
}

// ---- Words ----

// "this month", for "Spent this month" and the headline figures' captions.
export const PERIOD_WORDS: Record<Period, string> = {
  week: "in the last 7 days",
  month: "this month",
  year: "this year",
  all: "in total",
};
