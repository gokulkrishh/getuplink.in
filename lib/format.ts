const IST = "Asia/Kolkata";

const time = new Intl.DateTimeFormat("en-US", { timeZone: IST, hour: "numeric", minute: "2-digit", hour12: true });
const date = new Intl.DateTimeFormat("en-GB", { timeZone: IST, day: "numeric", month: "short", year: "numeric" });
const shortDate = new Intl.DateTimeFormat("en-GB", { timeZone: IST, day: "numeric", month: "short" });

// "9:15 AM IST"
export function formatTime(value: string | number | Date): string {
  return `${time.format(new Date(value))} IST`;
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

// "10:35 AM IST" when it was today (in IST), otherwise "21 Oct, 10:35 AM IST".
export function formatSeen(value: string | number | Date): string {
  return formatDate(value) === formatDate(new Date()) ? formatTime(value) : `${formatShortDate(value)}, ${formatTime(value)}`;
}
