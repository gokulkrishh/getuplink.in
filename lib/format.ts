import { istDay } from "@/lib/telemetry-derive";

const IST = "Asia/Kolkata";

const time = new Intl.DateTimeFormat("en-US", { timeZone: IST, hour: "numeric", minute: "2-digit", hour12: true });
const date = new Intl.DateTimeFormat("en-GB", { timeZone: IST, day: "numeric", month: "short", year: "numeric" });
const shortDate = new Intl.DateTimeFormat("en-GB", { timeZone: IST, day: "numeric", month: "short" });

// An hour of the day as the app writes times: "12 AM", "6 AM", "12 PM", "9 PM". For chart axes and slots,
// in place of shortcuts like "6a".
export function formatHour(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;
}

// A block of the day by its whole span, both ends written out: "6 AM to 9 AM", "9 PM to 12 AM". A bar
// or square that covers hours says so, never just its start, which reads as "at 6 AM".
export function formatHours(from: number, to: number): string {
  return `${formatHour(from)} to ${formatHour(to)}`;
}

// "9:15 AM IST"
export function formatTime(value: string | number | Date): string {
  return `${time.format(new Date(value))} IST`;
}

// "9:15 AM" (IST, no suffix)
export function formatClock(value: string | number | Date): string {
  return time.format(new Date(value));
}

// "21 Oct 2026"
export function formatDate(value: string | number | Date): string {
  return date.format(new Date(value));
}

// "21 Oct"
export function formatShortDate(value: string | number | Date): string {
  return shortDate.format(new Date(value));
}

// "21 Oct 2026, 9:15 AM IST"
export function formatDateTime(value: string | number | Date): string {
  return `${formatDate(value)}, ${formatTime(value)}`;
}

export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  // A day or more reads in days and hours ("1 day 14 h"); the minutes no longer matter.
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days} ${days === 1 ? "day" : "days"}${hours % 24 ? ` ${hours % 24} h` : ""}`;
  }
  return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
}

// Power drawn while parked is small, so it reads in watts ("24 W", "4.5 W" under 10) and in kW only from
// 1 kW ("1.2 kW").
export function formatPower(watts: number): string {
  if (Math.round(watts) >= 1000) return formatKw(watts / 1000);
  return `${formatNumber(watts, watts < 10 ? 1 : 0)} W`;
}

// "Full in 1 h 5 min" while charging; under a minute left, "Almost full" (not "Full in 0 min").
export function formatTimeToFull(hours: number): string {
  return hours < 1 / 60 ? "Almost full" : `Full in ${formatDuration(hours * 3600)}`;
}

// Precision per unit: how many decimals each kind of figure shows, wherever it appears (see docs/charts.md,
// "Precision"). Figures stay at full precision until they are shown; only these helpers round.
export const DECIMALS = {
  // Distance driven, from the odometer (read to a few metres) or the drives: "46.2 km".
  km: 1,
  // Range is the car's estimate, so tenths would be false precision: "287 km".
  rangeKm: 0,
  // Energy, from the car's counters and Tesla's bills: "11.1 kWh".
  kWh: 1,
  // Power: "7.2 kW". Small parked draw reads in watts (see formatPower).
  kW: 1,
  // A bill and anything summed from bills, in rupees and paise: "₹874.50".
  money: 2,
  // Battery level and shares of a whole: "66%".
  percent: 0,
  speed: 0,
  whPerKm: 0,
  kmPerKwh: 1,
} as const;

const fixedFormats = new Map<number, Intl.NumberFormat>();

// A number with exactly `decimals` decimals, trailing zeros kept ("46.0", "0.0"), and Indian digit
// grouping ("1,23,400.5"), so a figure reads the same digits wherever it appears.
export function formatNumber(value: number, decimals: number): string {
  let fmt = fixedFormats.get(decimals);
  if (!fmt) {
    fmt = new Intl.NumberFormat("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    fixedFormats.set(decimals, fmt);
  }
  // Rounded here, half up, with float noise snapped off first, so 1.15 (stored as 1.149999…) reads 1.2;
  // the formatter then only writes the digits.
  const units = Math.round(Math.round(value * 10 ** decimals * 1e6) / 1e6);
  const text = fmt.format(units / 10 ** decimals);
  // A tiny negative that rounds to zero reads "0.0", not "-0.0".
  return /^-0(\.0+)?$/.test(text) ? text.slice(1) : text;
}

// Whether a figure shows as zero at its unit's precision ("0.0", "₹0.00"). A chart draws no bar for it, so
// the bar and its "0.0 km" label agree: 0.04 km is not a sliver over "0.0".
export function showsZero(shown: string): boolean {
  return !/[1-9]/.test(shown);
}

// "46.2 km", "1,23,400.5 km": distance driven, to one decimal.
export function formatKm(value: number): string {
  return `${formatNumber(value, DECIMALS.km)} km`;
}

// "287 km": the car's range estimate, in whole kilometres.
export function formatRangeKm(value: number): string {
  return `${formatNumber(value, DECIMALS.rangeKm)} km`;
}

// "7.2 kW"
export function formatKw(value: number): string {
  return `${formatNumber(value, DECIMALS.kW)} kW`;
}

// "66%", or "1.4%" with decimals. Takes the percentage, not a share (66, not 0.66).
export function formatPercent(value: number, decimals: number = DECIMALS.percent): string {
  return `${formatNumber(value, decimals)}%`;
}

// "58% to 51%": a battery level before and after.
export function formatLevels(from: number, to: number): string {
  return `${formatPercent(from)} to ${formatPercent(to)}`;
}

// "92 km/h"
export function formatSpeed(kmh: number): string {
  return `${formatNumber(kmh, DECIMALS.speed)} km/h`;
}

// The total of a chart's or a list's parts, from the parts themselves (unknown ones add nothing), so the
// headline and the bars or rows come from one source. Add the raw values and round only to show the sum:
// each part and the total are rounded on their own, so the same quantity reads the same digits everywhere.
// Shown parts can then add up to a last digit off the shown total (46.215 + 7.416 + 46.377 = 100.008 km
// reads 46.2 + 7.4 + 46.4 against 100.0 here, but 0.35 + 0.35 + 0.35 reads 0.4 + 0.4 + 0.4 against 1.1);
// both are the honest values, so neither is adjusted to match.
export function sumKnown(values: readonly (number | null | undefined)[]): number {
  return values.reduce<number>((sum, v) => sum + (v ?? 0), 0);
}

// "10:35 AM IST" when it was today (in IST), otherwise "21 Oct, 10:35 AM IST". `now` is passed in
// (taken inside the page's cached loader) because reading the clock while rendering blocks prerendering.
export function formatSeen(value: string | number | Date, now: number): string {
  return formatDate(value) === formatDate(now) ? formatTime(value) : `${formatShortDate(value)}, ${formatTime(value)}`;
}

// "Today", "Yesterday" or "19 Oct" (IST). `now` is passed in for the same reason as formatSeen.
export function formatDayLabel(value: string | number | Date, now: number): string {
  const days = istDay(now) - istDay(new Date(value).getTime());
  return days === 0 ? "Today" : days === 1 ? "Yesterday" : formatShortDate(value);
}

const relative = new Intl.RelativeTimeFormat("en-IN", { numeric: "auto" });

// "just now", "3 minutes ago", "2 hours ago", "yesterday", "3 days ago"; older than a week falls back
// to formatSeen.
export function formatAgo(value: string | number | Date, now: number): string {
  const minutes = Math.round((now - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return relative.format(-minutes, "minute");
  if (minutes < 24 * 60) return relative.format(-Math.round(minutes / 60), "hour");
  if (minutes < 7 * 24 * 60) return relative.format(-Math.floor(minutes / (24 * 60)), "day");
  return formatSeen(value, now);
}

const celsius = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

// "30.5 to 35.5 °C": the car reports battery temperatures in half degrees, so whole numbers would show
// 35.5 as 36, a degree the battery never reached.
export function formatTempRange(low: number, high: number): string {
  return `${celsius.format(low)} to ${celsius.format(high)} °C`;
}

// "35.5 °C", "30 °C": up to one decimal, as the car reports temperatures. A temperature is never summed,
// so it needn't hold a fixed number of decimals.
export function formatCelsius(value: number): string {
  return `${celsius.format(value)} °C`;
}

// "32.4 kWh"
export function formatKwh(value: number): string {
  return `${formatNumber(value, DECIMALS.kWh)} kWh`;
}

// "₹874.50" for INR (en-IN grouping): a bill, or a sum of bills, to the paisa.
export function formatMoney(value: number, currency: string): string {
  let fmt = moneyFormats.get(currency);
  if (!fmt) {
    try {
      fmt = new Intl.NumberFormat("en-IN", { style: "currency", currency });
    } catch {
      // Invalid currency code (RangeError): show the raw code rather than crash.
      return `${currency} ${value.toFixed(2)}`;
    }
    moneyFormats.set(currency, fmt);
  }
  return fmt.format(value);
}

const moneyFormats = new Map<string, Intl.NumberFormat>();
const month = new Intl.DateTimeFormat("en-GB", { timeZone: IST, month: "long", year: "numeric" });

// "October 2026", in IST. Also the key that groups sessions by month.
export function formatMonth(value: string | number | Date): string {
  return month.format(new Date(value));
}

// "3 days", "1.5 days"; under a day it falls back to formatDuration ("5 h 20 min").
export function formatDays(seconds: number): string {
  const days = seconds / 86_400;
  if (days < 1) return formatDuration(seconds);
  const rounded = Math.round(days);
  return `${rounded} ${rounded === 1 ? "day" : "days"}`;
}
