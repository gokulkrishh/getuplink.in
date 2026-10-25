import { formatDate, formatShortDate } from "@/lib/format";
import { istDay, istDayStart } from "@/lib/telemetry-derive";

// Pure period maths for the home page and the Stats pages: which instants a period covers, the bars it
// draws and the span it is compared with. Everything is in IST, never server-local date getters.

export type Period = "day" | "week" | "month" | "year" | "all";

export const PERIOD_ORDER: Period[] = ["day", "week", "month", "year", "all"];

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
  if (period === "month" || period === "week" || period === "day") return index === cur;
  if (period === "year") return yearOf(index) === yearOf(cur);
  return true;
}

// ---- Spans ----

// [from, to) as instants. A period runs to Infinity: nothing is dated after now, and a counter's last
// value before Infinity is its latest.
export type Span = { from: number; to: number };

export const inSpan = (at: number, span: Span) => at >= span.from && at < span.to;

// The period so far: today (IST), the last 7 IST days (today included), this month, this year, or
// everything.
export function periodSpan(period: Period, now: number): Span {
  const cur = monthIndex(now);
  if (period === "day") return { from: istDayStart(istDay(now)), to: Infinity };
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
  // Yesterday, all of it.
  if (period === "day") return { from: from - DAY_MS, to: from };
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
  if (period === "day") return "yesterday";
  // The span ends just before `to`; on the 1st it is that one day.
  const last = span.to - 1;
  if (istDay(last) === istDay(span.from)) return period === "month" ? formatShortDate(span.from) : formatDate(span.from);
  const firstDay = formatShortDate(span.from).split(" ")[0];
  if (period === "month") return `${firstDay} to ${formatShortDate(last)}`;
  return `${formatShortDate(span.from)} to ${formatDate(last)}`;
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
  if (period === "day") {
    // Today in 3-hour slots: when you drove or charged.
    const start = istDayStart(istDay(now));
    const hour = (h: number) => (h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`);
    return Array.from({ length: 8 }, (_, k) => {
      const from = start + k * 3 * 3_600_000;
      return { id: from, label: hour(k * 3), from, to: from + 3 * 3_600_000, isCurrent: now >= from && now < from + 3 * 3_600_000 };
    });
  }
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
  day: "today",
  week: "in the last 7 days",
  month: "this month",
  year: "this year",
  all: "in total",
};

// What one bar of slotsFor covers, for screen readers: "Spend per day".
export const SLOT_NAMES: Record<Period, string> = { day: "3 hours", week: "day", month: "month", year: "month", all: "year" };

// When some figure has nothing to compare with because its tracking began after the span before started
// (`starts`: when each kind of tracking began, null for none), the earliest such start; else null. All has
// no span before, so null.
export function trackingGap(before: Span | null, starts: (number | null)[]): number | null {
  if (before === null) return null;
  const late = starts.filter((at): at is number => at !== null && at > before.from);
  return late.length > 0 ? Math.min(...late) : null;
}

// ---- Timeframes ----

// What a period, or a range picked by date, covers, for whatever follows either: its span, the span it is
// compared with and that span in words, its bars, and words for captions. `title` heads a caption
// ("Last 7 days"), `words` ends a sentence ("No driving in the last 7 days"), `slotName` names one bar for
// screen readers, and `labelEvery` thins the bar labels when there are many (see Bars).
export type Timeframe = {
  span: Span;
  previous: Span | null;
  previousLabel: string | null;
  slots: Slot[];
  slotName: string;
  title: string;
  words: string;
  labelEvery?: number;
};

const PERIOD_TITLES: Record<Period, string> = { day: "Today", week: "Last 7 days", month: "This month", year: "This year", all: "All time" };

export function periodTimeframe(period: Period, now: number): Timeframe {
  return {
    span: periodSpan(period, now),
    previous: previousSpan(period, now),
    previousLabel: previousLabel(period, now),
    slots: slotsFor(period, now),
    slotName: SLOT_NAMES[period],
    title: PERIOD_TITLES[period],
    words: PERIOD_WORDS[period],
  };
}

// A range picked by date: IST days (see istDay), both included.
export type DayRange = { from: number; to: number };

// The longest range the picker offers to go back, so a typo like year 0026 can't draw centuries of bars.
const EARLIEST_DAY = Date.UTC(2012, 0, 1) / DAY_MS;

// "2026-10-25" for an IST day, as a date input holds it. An IST day's number is its date's UTC day number.
export const dayIso = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);

export function isoDay(value: string | string[] | undefined): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(ms) ? null : ms / DAY_MS;
}

// The last 30 days, today included: what Custom opens on.
export function defaultRange(now: number): DayRange {
  const today = istDay(now);
  return { from: today - 29, to: today };
}

// The range in a URL's from and to, kept between the earliest day offered and today, the earlier first;
// null when either is missing or not a date.
export function parseRange(from: string | string[] | undefined, to: string | string[] | undefined, now: number): DayRange | null {
  const a = isoDay(from);
  const b = isoDay(to);
  if (a === null || b === null) return null;
  const clamp = (day: number) => Math.min(istDay(now), Math.max(EARLIEST_DAY, day));
  const [x, y] = [clamp(a), clamp(b)];
  return { from: Math.min(x, y), to: Math.max(x, y) };
}

const rangeDays = (range: DayRange) => range.to - range.from + 1;

// The range as instants. One that reaches today runs to Infinity, like a period (see Span).
export function rangeSpan(range: DayRange, now: number): Span {
  return { from: istDayStart(range.from), to: range.to >= istDay(now) ? Infinity : istDayStart(range.to + 1) };
}

// The same number of days right before.
export function rangePrevious(range: DayRange): Span {
  return { from: istDayStart(range.from - rangeDays(range)), to: istDayStart(range.from) };
}

// Two IST days in words: "1 Sept to 30 Sept" this year, "30 Dec 2025 to 2 Jan 2026" otherwise, "21 Oct"
// for one day.
export function daysLabel(from: number, to: number, now: number): string {
  const thisYear = yearOf(monthIndex(now));
  const sameYear = yearOf(monthIndex(istDayStart(from))) === thisYear && yearOf(monthIndex(istDayStart(to))) === thisYear;
  const day = (d: number) => (sameYear ? formatShortDate(istDayStart(d) + DAY_MS / 2) : formatDate(istDayStart(d) + DAY_MS / 2));
  return from === to ? day(from) : `${day(from)} to ${day(to)}`;
}

// The bars a range draws, sized to it: 3-hour slots for up to 2 days, days up to 45, months up to 3 years,
// then years. A month or year cut by the range covers only its part of it.
export function rangeSlots(range: DayRange, now: number): { slots: Slot[]; slotName: string; labelEvery?: number } {
  const span = rangeSpan(range, now);
  const end = Math.min(span.to, istDayStart(range.to + 1));
  const days = rangeDays(range);
  const slot = (from: number, to: number, label: string): Slot => ({ id: from, label, from, to, isCurrent: now >= from && now < to });
  if (days <= 2) {
    const hour = (h: number) => (h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`);
    const slots = Array.from({ length: days * 8 }, (_, k) => {
      const from = span.from + k * 3 * 3_600_000;
      // With two days, each day's first bar is named for its day.
      const label = days === 2 && k % 8 === 0 ? weekday.format(from + DAY_MS / 2) : hour((k % 8) * 3);
      return slot(from, from + 3 * 3_600_000, label);
    });
    return { slots, slotName: "3 hours" };
  }
  if (days <= 45) {
    const slots = Array.from({ length: days }, (_, k) => {
      const day = range.from + k;
      return slot(istDayStart(day), istDayStart(day + 1), days <= 7 ? weekday.format(istDayStart(day) + DAY_MS / 2) : formatShortDate(istDayStart(day) + DAY_MS / 2));
    });
    return { slots, slotName: "day", labelEvery: days <= 7 ? undefined : days <= 14 ? 2 : 7 };
  }
  const first = monthIndex(span.from);
  const last = monthIndex(end - 1);
  if (last - first < 36) {
    const years = yearOf(first) !== yearOf(last);
    const slots = Array.from({ length: last - first + 1 }, (_, k) => {
      const m = first + k;
      return slot(Math.max(span.from, monthStart(m)), Math.min(end, monthStart(m + 1)), years ? `${monthShort(m)} ${yearOf(m)}` : monthShort(m));
    });
    return { slots, slotName: "month" };
  }
  const slots = Array.from({ length: yearOf(last) - yearOf(first) + 1 }, (_, k) => {
    const year = yearOf(first) + k;
    return slot(Math.max(span.from, monthStart(year * 12)), Math.min(end, monthStart((year + 1) * 12)), String(year));
  });
  // Year labels are four characters, more than a dense chart keeps (see MonthLabel), so each is shown whole.
  return { slots, slotName: "year", labelEvery: slots.length > 6 ? 1 : undefined };
}

export function rangeTimeframe(range: DayRange, now: number): Timeframe {
  const previous = rangePrevious(range);
  const label = daysLabel(range.from, range.to, now);
  return {
    span: rangeSpan(range, now),
    previous,
    previousLabel: daysLabel(istDay(previous.from), istDay(previous.to - 1), now),
    ...rangeSlots(range, now),
    title: label,
    words: range.from === range.to ? `on ${label}` : `from ${label}`,
  };
}
