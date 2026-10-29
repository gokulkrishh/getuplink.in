import "server-only";
import type { Poll } from "@/lib/awake";
import { demoData } from "./index";

const MIN = 60_000;
const HOUR = 3_600_000;
const POLL_EVERY = 6 * HOUR; // the cron runs at 00:00, 06:00, 12:00 and 18:00 UTC

// The poll's checks for the demo car: online when it sent a reading within 10 minutes, otherwise asleep.
// One check is missed and two found it offline (a basement car park), so every state shows up.
export function demoPolls(days: number): Poll[] {
  const data = demoData();
  // Just connected: the one check made at setup, nothing before it.
  if (Object.keys(data.readings).length === 0) return [{ at: Date.parse(data.snapshot.polled_at), state: data.snapshot.state }];
  const times = Object.values(data.readings)
    .flat()
    .map((r) => Date.parse(r.at));
  const awake = (t: number) => times.some((r) => Math.abs(r - t) <= 10 * MIN);
  const first = Math.ceil((data.now - days * 24 * HOUR) / POLL_EVERY) * POLL_EVERY;
  const polls: Poll[] = [];
  for (let k = 0, t = first; t <= data.now - 6 * MIN; k++, t += POLL_EVERY) {
    const at = t + 40_000;
    if (k === 9) continue;
    const state = awake(at) ? "online" : k === 30 || k === 31 ? "offline" : "asleep";
    polls.push({ at, state });
  }
  // The latest check, six minutes ago, like the dashboard's snapshot.
  polls.push({ at: Date.parse(data.snapshot.polled_at), state: data.snapshot.state });
  return polls;
}
