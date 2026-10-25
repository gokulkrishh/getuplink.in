import { istDay } from "@/lib/telemetry-derive";

const IST = "Asia/Kolkata";

const time = new Intl.DateTimeFormat("en-US", { timeZone: IST, hour: "numeric", minute: "2-digit", hour12: true });
const date = new Intl.DateTimeFormat("en-GB", { timeZone: IST, day: "numeric", month: "short", year: "numeric" });
const shortDate = new Intl.DateTimeFormat("en-GB", { timeZone: IST, day: "numeric", month: "short" });

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
  if (Math.round(watts) >= 1000) return `${(watts / 1000).toFixed(1)} kW`;
  return `${watts < 10 ? Math.round(watts * 10) / 10 : Math.round(watts)} W`;
}

// "Full in 1 h 5 min" while charging; under a minute left, "Almost full" (not "Full in 0 min").
export function formatTimeToFull(hours: number): string {
  return hours < 1 / 60 ? "Almost full" : `Full in ${formatDuration(hours * 3600)}`;
}

const km = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

// "12,340 km" (Indian digit grouping: "1,23,400 km")
export function formatKm(value: number): string {
  return `${km.format(value)} km`;
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

// "32.4 kWh"
export function formatKwh(value: number): string {
  return `${value.toFixed(1)} kWh`;
}

// "₹874.50" for INR (en-IN grouping)
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
