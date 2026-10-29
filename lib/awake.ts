import { formatClock, formatDuration } from "@/lib/format";
import { istDay, istDayStart } from "@/lib/telemetry-derive";

// Pure helpers for the online and asleep timeline on the Updates tab.

export type Presence = "online" | "asleep" | "offline" | "unknown";
export type Poll = { at: number; state: string }; // a snapshot: "online", "asleep" or "offline"
// seen: when the car sent data or a check found it in this state, oldest first. Empty for unknown.
export type Run = { start: number; end: number; state: Presence; seen: number[] };
export type DayStrip = { day: number; start: number; runs: Run[] };

const MIN = 60_000;
const DAY = 86_400_000;
export const SLOT_MS = 15 * MIN;

// Fields the car sends every few minutes while it is awake (the pack drains, the counter ticks), plus update
// downloads. A scan across every field would not be served by the (vin, field, created_at) index, so these
// stand in for all of them. Soc and IsolationResistance are in because the other three missed 4 of the 66
// quarter hours the car streamed in from 21 to 25 Oct 2026: 24 Oct 11:00 IST sent 86 readings, among them
// IsolationResistance but none of the others, and the 25 Oct 12:00 slot had Soc but none of the others.
export const PRESENCE_FIELDS = ["EnergyRemaining", "IsolationResistance", "LifetimeEnergyUsed", "Soc", "SoftwareUpdateDownloadPercentComplete"];

// The car sends data every few minutes while awake, so readings this close together mean it was awake
// from the first to the last. A wider gap could hide a sleep.
const STEADY_GAP_MS = 10 * MIN;

// One strip per IST day, oldest first, each a list of runs. The car never says when it wakes or sleeps,
// so nothing is stretched or guessed: a 15-minute slot is online only if the car sent data or a check
// found it online in it, asleep or offline only if a check said so, and unknown otherwise. The rest of
// today is left out.
export function awakeDays(readings: number[], polls: Poll[], now: number, days: number): DayStrip[] {
  const firstDay = istDay(now) - days + 1;
  const from = istDayStart(firstDay);
  const slots = Math.ceil((now - from) / SLOT_MS);
  const state: Presence[] = Array(slots).fill("unknown");
  const slotOf = (t: number) => Math.floor((t - from) / SLOT_MS);

  const seen: Record<Presence, number[]> = {
    online: [...readings, ...polls.filter((p) => p.state === "online").map((p) => p.at)],
    asleep: polls.filter((p) => p.state === "asleep").map((p) => p.at),
    offline: polls.filter((p) => p.state === "offline").map((p) => p.at),
    unknown: [],
  };
  for (const times of Object.values(seen)) times.sort((a, b) => a - b);
  // Asleep and offline first, so online evidence wins any slot they share.
  for (const value of ["asleep", "offline", "online"] as const) {
    for (const t of seen[value]) if (t < now && slotOf(t) >= 0) state[slotOf(t)] = value;
  }

  return Array.from({ length: days }, (_, k) => {
    const start = istDayStart(firstDay + k);
    const runs: Run[] = [];
    for (let s = slotOf(start); s < Math.min(slots, slotOf(start + DAY)); s++) {
      const last = runs[runs.length - 1];
      if (last && last.state === state[s]) last.end += SLOT_MS;
      else runs.push({ start: from + s * SLOT_MS, end: from + (s + 1) * SLOT_MS, state: state[s], seen: [] });
    }
    if (runs.length > 0) runs[runs.length - 1].end = Math.min(runs[runs.length - 1].end, now);
    for (const r of runs) r.seen = seen[r.state].filter((t) => t >= r.start && t < r.end);
    return { day: firstDay + k, start, runs };
  });
}

// Whether the strips hold anything but unknown, so the section can stay hidden without data.
export function hasPresence(strips: DayStrip[]): boolean {
  return strips.some((d) => d.runs.some((r) => r.state !== "unknown"));
}

export const PRESENCE_LABEL: Record<Presence, string> = { online: "Awake", asleep: "Asleep", offline: "Out of reach", unknown: "No data" };

// "7:12 PM to 7:40 PM", "11:30 AM to 6:05 PM": both ends in full, like every span of time in the app.
function clockRange(start: number, end: number): string {
  return `${formatClock(start)} to ${formatClock(end)}`;
}

// Times seen close together (see STEADY_GAP_MS) as [first, last] spans.
function spans(times: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const t of times) {
    const last = out[out.length - 1];
    if (last && t - last[1] <= STEADY_GAP_MS) last[1] = t;
    else out.push([t, t]);
  }
  return out;
}

const MAX_SPANS = 3;

// Only what was seen, in IST, 12-hour like the strip's axis: "Awake · 8:12 AM" for one reading,
// "Awake · 7:12–7:40 PM · 28 min" when steady readings show it awake throughout, "Asleep · 2:00 AM"
// for a check. A length shows only when it's known. "No data · 12:00 AM–6:00 AM" for a gap.
export function runLabel(run: Run): string {
  const label = PRESENCE_LABEL[run.state];
  if (run.state === "unknown" || run.seen.length === 0) return `${label} · ${clockRange(run.start, run.end)}`;
  const all = spans(run.seen);
  const shown = all.slice(0, MAX_SPANS).map(([a, b]) => (a === b ? formatClock(a) : clockRange(a, b)));
  if (all.length > MAX_SPANS) shown.push(`${all.length - MAX_SPANS} more`);
  const [only] = all;
  const length = all.length === 1 && only[1] - only[0] >= MIN ? ` · ${formatDuration((only[1] - only[0]) / 1000)}` : "";
  return `${label} · ${shown.join(", ")}${length}`;
}

// The line over the awake strips. One day is a sentence, since a count of "1 of 1" says nothing; more
// days count the online ones, "since 26 Oct" (`since`) when tracking began inside the last days shown.
export function awakeSentence(onlineDays: number, days: number, since: string | null): string {
  if (days === 1) return onlineDays > 0 ? "Seen awake today." : "Not seen awake yet today.";
  return since ? `Awake on ${onlineDays} of ${days} days since ${since}` : `Awake on ${onlineDays} of the last ${days} days`;
}
