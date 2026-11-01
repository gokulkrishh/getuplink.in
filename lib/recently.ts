// What changed lately, for the car strip on home (one line each, closing the strip under the battery): the last drive and the last charge, each only when it is
// known and ended in the last day. Pure like the other helpers: the loader's lists go in, items come out.
import type { Drive } from "@/lib/drives";
import { formatClock, formatDayLabel, formatKm, formatKwh, formatLevels, showsZero } from "@/lib/format";
import { istDay } from "@/lib/telemetry-derive";

// `figure`: how much ("18.4 km", "50% to 80%", "12.4 kWh"), null when a charge read neither.
// `when`: a drive's start to end ("8:30 AM to 8:52 AM"), so it doesn't repeat the car's "Parked since";
// a charge's end. Both stand on their own line: "Yesterday, 6:10 PM".
export type RecentItem = { kind: "drive" | "charge"; figure: string | null; when: string; href: string };

// Older than this is history, not news. A plain rule, not the AI's call: the AI never runs on a page view,
// and what counts as recent changes by the hour.
export const RECENT_MS = 24 * 60 * 60_000;

type Charge = { id: number; vin?: string; started_at: string; ended_at: string | null; start_level: number | null; end_level: number | null; energy_added_kwh: number | null };

// "8:52 AM" with a no-break space, so a narrow screen wraps before the time, never inside it.
const clock = (at: number) => formatClock(at).replace(" ", " ");

// "8:52 AM" today, "Yesterday, 8:52 AM", "19 Oct, 8:52 AM". With `to`, a span on one day: "8:30 AM to 8:52 AM".
function when(at: number, now: number, to?: number): string {
  const time = to === undefined || istDay(to) !== istDay(at) ? clock(at) : `${clock(at)} to ${clock(to)}`;
  return istDay(at) === istDay(now) ? time : `${formatDayLabel(at, now)}, ${time}`;
}

const isRecent = (at: number, now: number) => at <= now && now - at <= RECENT_MS;

// The newest drive that moved the car, linked to its trip page; the newest finished charge, linked to its
// page. A charge says its levels when both were read, else the energy added, else no figure.
// `vin`: the car whose block this is; the charge list covers every car on the account.
export function recentlyLines(drives: Drive[], charges: Charge[], now: number, vin?: string): RecentItem[] {
  const items: RecentItem[] = [];
  const drive = drives.reduce<Drive | null>((best, d) => (!best || d.end > best.end ? d : best), null);
  if (drive && isRecent(drive.end, now) && !showsZero(formatKm(drive.km))) {
    items.push({ kind: "drive", figure: formatKm(drive.km), when: when(drive.start, now, drive.end), href: `/stats/driving/${drive.start}` });
  }
  const charge = charges.find((c) => c.ended_at !== null && (vin === undefined || c.vin === vin));
  const ended = charge?.ended_at ? Date.parse(charge.ended_at) : null;
  if (charge && ended !== null && isRecent(ended, now)) {
    const { start_level: from, end_level: to, energy_added_kwh: kwh } = charge;
    const figure = from !== null && to !== null && to > from ? formatLevels(from, to) : kwh !== null && kwh > 0 && !showsZero(formatKwh(kwh)) ? formatKwh(kwh) : null;
    items.push({ kind: "charge", figure, when: when(ended, now), href: `/stats/charging/${charge.id}` });
  }
  return items;
}
