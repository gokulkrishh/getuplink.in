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
