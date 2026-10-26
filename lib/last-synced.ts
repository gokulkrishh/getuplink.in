import { formatClock, formatShortDate } from "@/lib/format";

// When Uplink last heard from a car, in plain words. Every page that says so uses these, from the same two
// times: the latest check (snapshots.polled_at, any state) and the newest streamed reading. Pure, so tested.

// Checks run every 12 hours, so a car not heard from for longer is overdue and its numbers may be old.
export const STALE_SYNC_MS = 12 * 60 * 60 * 1000;

// The newest of the times given, or null when there are none.
export function newestTime(times: (string | null | undefined)[]): string | null {
  let newest: string | null = null;
  for (const t of times) if (t && !Number.isNaN(Date.parse(t)) && (newest === null || Date.parse(t) > Date.parse(newest))) newest = t;
  return newest;
}

// "7 hours ago", "1 day ago", "3 days ago": how old a stale sync is, in whole hours under a day, else days.
export function syncAge(at: string, now: number): string {
  const hours = Math.floor((now - Date.parse(at)) / 3_600_000);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

// "Last synced 25 Oct, 10:42 AM" (IST); past STALE_SYNC_MS, with how long ago first, so old numbers are
// obvious: "Last synced 2 days ago, 23 Oct, 10:42 AM". "Not synced yet" when there's no time.
export function lastSyncedText(at: string | null, now: number): string {
  if (!at) return "Not synced yet";
  const when = `${formatShortDate(at)}, ${formatClock(at)}`;
  return now - Date.parse(at) > STALE_SYNC_MS ? `Last synced ${syncAge(at, now)}, ${when}` : `Last synced ${when}`;
}

export const isStaleSync = (at: string | null, now: number) => at !== null && now - Date.parse(at) > STALE_SYNC_MS;
