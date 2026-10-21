import { formatMonth } from "@/lib/format";

export type Period = "month" | "6m" | "year" | "all";

export const PERIODS: { value: Period; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "6m", label: "6 months" },
  { value: "year", label: "Year" },
  { value: "all", label: "All time" },
];

export function parsePeriod(value: string | string[] | undefined): Period {
  return PERIODS.find((p) => p.value === value)?.value ?? "month";
}

const istParts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "numeric" });
const shortMonth = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "Asia/Kolkata" });

// Months are counted as year * 12 + month (0-11) in IST, never with server-local date getters.
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

export const monthKey = (index: number) => formatMonth(monthDate(index));
export const monthShort = (index: number) => shortMonth.format(monthDate(index));
