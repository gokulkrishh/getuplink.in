import { type CustomQuery, customRange, periodTimeframe, rangeTimeframe, type Timeframe } from "@/lib/periods";
import type { HomePeriod } from "@/components/stats/periods";

// Long lists show this many rows, then "Show N more". A list whose rows are tall or wide picks its own.
export const LIST_PREVIEW = 3;

// A long list as the page sends it: its first rows, and how many there are in all. The rest stay on the
// server until "Show N more" asks for them (see usePaged).
export type Paged<T> = { rows: T[]; total: number };

export const paged = <T>(all: T[], first = LIST_PREVIEW): Paged<T> => ({ rows: all.slice(0, first), total: all.length });

// The rows after the first `offset`, `Paged`'s second half. A server action of this shape is bound to the
// list's scope and handed to the client, which calls it with how many rows it already has.
export type LoadMore<T> = (offset: number) => Promise<T[]>;

// Which period a list was drawn for, as a server action gets it back: the switch's choice, and the dates of
// a range picked by date (see customQuery).
export type ListScope = { period: HomePeriod; query: CustomQuery | null };

// The scope's span of time, or null when the browser sent a period or range this page doesn't offer.
export function scopeTimeframe({ period, query }: ListScope, now: number): Timeframe | null {
  if (period !== "custom") return ["day", "week", "month", "year", "all"].includes(period) ? periodTimeframe(period, now) : null;
  const range = query && customRange("custom", query.from ?? undefined, query.to ?? undefined, now);
  return range ? rangeTimeframe(range, now) : null;
}
