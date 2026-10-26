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

// A number with exactly `decimals` decimals and Indian digit grouping ("1,23,400.5"), so a total and its
// parts read at the same precision. Exactly zero reads "0", not "0.0": nothing at all, not a rounded crumb.
export function formatNumber(value: number, decimals: number): string {
  if (value === 0) return "0";
  let fmt = fixedFormats.get(decimals);
  if (!fmt) {
    fmt = new Intl.NumberFormat("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    fixedFormats.set(decimals, fmt);
  }
  // Rounded here, half up, with float noise snapped off first, so 1.15 (stored as 1.149999…) reads 1.2,
  // as apportion rounds it; the formatter then only writes the digits.
  const units = Math.round(Math.round(value * 10 ** decimals * 1e6) / 1e6);
  const text = fmt.format(units / 10 ** decimals);
  // A tiny negative that rounds to zero reads "0.0", not "-0.0".
  return /^-0(\.0+)?$/.test(text) ? text.slice(1) : text;
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

// Rounds the parts of a whole for display so that, as shown, they add up to the whole rounded the same
// way (largest remainder): days of 46.215, 7.416 and 46.377 km show as 46.2, 7.4 and 46.4, and their sum,
// 100.008, as 100.0 (rounded alone they would read 46, 7 and 46 against 100). A part moves at most one
// last digit from its own rounding, and only a part with something to round moves: an exact 0 stays 0.
// Null (unknown, or ahead of now) stays null. `total` makes the parts add up to a total already shown
// (a stacked bar's), when it is within a last digit or two of theirs.
export function apportion(values: readonly (number | null)[], decimals: number, total?: number): (number | null)[] {
  const scale = 10 ** decimals;
  // Float noise is snapped off, so a value already at this precision has no remainder.
  const scaled = values.map((v) => (v === null ? null : Math.round(v * scale * 1e6) / 1e6));
  const units = scaled.map((v) => (v === null ? null : Math.floor(v)));
  const target = total === undefined ? Math.round(scaled.reduce<number>((sum, v) => sum + (v ?? 0), 0)) : Math.round(total * scale);
  let left = target - units.reduce<number>((sum, v) => sum + (v ?? 0), 0);
  const order = scaled
    .flatMap((v, k) => (v === null || v === units[k] ? [] : [{ k, rest: v - units[k]! }]))
    .sort((a, b) => b.rest - a.rest || a.k - b.k);
  for (const { k } of order) {
    if (left <= 0) break;
    units[k]! += 1;
    left -= 1;
  }
  // A total below the parts' floors takes the excess back from the parts with the least to round.
  for (const { k } of [...order].reverse()) {
    if (left >= 0) break;
    if (units[k]! > 0) {
      units[k]! -= 1;
      left += 1;
    }
  }
  return units.map((u) => (u === null ? null : u / scale));
}

// The parts as shown and the total they add up to, from one apportion: show `total` as the headline and
// `parts` as the bars, their tips and the rows, and they agree to the last digit.
export function shownTotal(values: readonly (number | null)[], decimals: number): { parts: (number | null)[]; total: number } {
  const parts = apportion(values, decimals);
  const units = parts.reduce<number>((sum, v) => sum + Math.round((v ?? 0) * 10 ** decimals), 0);
  return { parts, total: units / 10 ** decimals };
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
