import { formatShortDate } from "@/lib/format";
import { inSpan, type Span } from "@/lib/periods";

// Pure helpers for sections whose data is kept only for a while (30 days of charge level readings, 12
// weeks of capacity estimates, the latest few DC curves): what of it falls in a span, and a plain note
// when the span starts before the first item held.

const WEEK = 7 * 86_400_000;

// "Readings go back to 25 Sept." when the span starts before the first item held (`first`, an instant);
// null when it doesn't, or nothing is held. Names the first item seen, never the window's start, so it
// can't claim readings from before tracking began.
export function backTo(span: Span, first: number | null | undefined, what: string): string | null {
  if (first === null || first === undefined || !Number.isFinite(first) || first <= span.from) return null;
  return `${what} go back to ${formatShortDate(first)}`;
}

// The items dated in the span, in their order.
export function within<T>(items: T[], span: Span, at: (item: T) => number): T[] {
  return items.filter((item) => inSpan(at(item), span));
}

// The items that overlap the span at all, for stretches of time (a stretch parked across midnight counts
// for both days).
export function overlapping<T>(items: T[], span: Span, start: (item: T) => number, end: (item: T) => number): T[] {
  return items.filter((item) => start(item) < span.to && end(item) > span.from);
}

// The weeks (by their start) that overlap the span, for weekly figures.
export function weeksIn<T extends { weekStart: number }>(weeks: T[], span: Span): T[] {
  return overlapping(weeks, span, (w) => w.weekStart, (w) => w.weekStart + WEEK);
}

// Where a list capped to its newest `cap` items (newest first) stops: the start of the oldest one held,
// when the cap cut some off; null when every item is held, so nothing is missing.
export function cappedFrom<T>(newestFirst: T[], cap: number, at: (item: T) => number): number | null {
  return newestFirst.length > cap ? at(newestFirst[cap - 1]) : null;
}

// Serial numbers for the records a list shows, newest first: the top row is 1.
export function serials<T, K>(newestFirst: T[], key: (item: T) => K): Map<K, number> {
  return new Map(newestFirst.map((item, i) => [key(item), i + 1]));
}
