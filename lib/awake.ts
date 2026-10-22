import { formatClock, formatDuration } from "@/lib/format";
import { istDay, istDayStart } from "@/lib/telemetry-derive";

// Pure helpers for the online and asleep timeline on the Updates tab.

export type Presence = "online" | "asleep" | "offline" | "unknown";
export type Poll = { at: number; state: string }; // a snapshot: "online", "asleep" or "offline"
export type Run = { start: number; end: number; state: Presence };
export type DayStrip = { day: number; start: number; runs: Run[] };

const MIN = 60_000;
const DAY = 86_400_000;
export const SLOT_MS = 15 * MIN;
// A reading means the car was awake for the next 10 minutes, the same rule as Settings' Live status.
const READING_MS = 10 * MIN;
// A check that found the car asleep or offline holds until the next reading or check, at most this long
// (the poll runs every 6 hours).
const HOLD_MS = 6.5 * 60 * MIN;

// One strip per IST day, oldest first, each a list of runs. Online comes from readings and online checks;
// asleep and offline only from a check that said so. Anything else is unknown, never guessed as asleep.
// The rest of today is left out.
export function awakeDays(readings: number[], polls: Poll[], now: number, days: number): DayStrip[] {
  const firstDay = istDay(now) - days + 1;
  const from = istDayStart(firstDay);
  const slots = Math.ceil((now - from) / SLOT_MS);
  const state: Presence[] = Array(slots).fill("unknown");
  const slotOf = (t: number) => Math.floor((t - from) / SLOT_MS);
  const mark = (start: number, end: number, value: Presence) => {
    for (let s = Math.max(0, slotOf(start)); s <= Math.min(slots - 1, slotOf(end - 1)); s++) state[s] = value;
  };

  const times = [...readings].sort((a, b) => a - b);
  const sorted = [...polls].sort((a, b) => a.at - b.at);
  // Asleep and offline first, so online evidence wins any slot they share.
  for (const [k, poll] of sorted.entries()) {
    if (poll.state !== "asleep" && poll.state !== "offline") continue;
    const nextReading = times.find((t) => t > poll.at) ?? Infinity;
    const nextPoll = sorted[k + 1]?.at ?? Infinity;
    mark(poll.at, Math.min(nextReading, nextPoll, poll.at + HOLD_MS, now), poll.state);
  }
  for (const poll of sorted) if (poll.state === "online") mark(poll.at, poll.at + READING_MS, "online");
  for (const t of times) mark(t, Math.min(t + READING_MS, now), "online");

  return Array.from({ length: days }, (_, k) => {
    const start = istDayStart(firstDay + k);
    const runs: Run[] = [];
    for (let s = slotOf(start); s < Math.min(slots, slotOf(start + DAY)); s++) {
      const last = runs[runs.length - 1];
      if (last && last.state === state[s]) last.end += SLOT_MS;
      else runs.push({ start: from + s * SLOT_MS, end: from + (s + 1) * SLOT_MS, state: state[s] });
    }
    if (runs.length > 0) runs[runs.length - 1].end = Math.min(runs[runs.length - 1].end, now);
    return { day: firstDay + k, start, runs };
  });
}

// Whether the strips hold anything but unknown, so the section can stay hidden without data.
export function hasPresence(strips: DayStrip[]): boolean {
  return strips.some((d) => d.runs.some((r) => r.state !== "unknown"));
}

export const PRESENCE_LABEL: Record<Presence, string> = { online: "Online", asleep: "Asleep", offline: "Offline", unknown: "No data" };

// "Online · 7:12–7:40 PM · 28 min", or "Asleep · 11:30 PM–6:05 AM · 6 h 35 min" when the run spans
// AM and PM. IST, 12-hour like the strip's axis; the shared AM or PM is said once.
export function runLabel(run: Run): string {
  const [from, to] = [formatClock(run.start), formatClock(run.end)];
  const same = from.slice(-2) === to.slice(-2);
  const range = `${same ? from.slice(0, -3) : from}\u2013${to}`;
  return `${PRESENCE_LABEL[run.state]} · ${range} · ${formatDuration((run.end - run.start) / 1000)}`;
}
