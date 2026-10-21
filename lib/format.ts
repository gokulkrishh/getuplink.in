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
  return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
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

const relative = new Intl.RelativeTimeFormat("en-IN", { numeric: "auto" });

// "just now", "3 minutes ago", "2 hours ago"; older than a day falls back to formatSeen.
export function formatAgo(value: string | number | Date, now: number): string {
  const minutes = Math.round((now - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return relative.format(-minutes, "minute");
  if (minutes < 24 * 60) return relative.format(-Math.round(minutes / 60), "hour");
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
  const rounded = days < 10 ? Math.round(days * 10) / 10 : Math.round(days);
  return `${rounded} ${rounded === 1 ? "day" : "days"}`;
}
