import "server-only";
import type { DriveFacts, DriveWords } from "@/lib/drive-facts";
import { checkWording } from "@/lib/drive-wording";

// Stand-in AI wording for the demo car's drives (the "why" line), so the demo shows the sparkles mark and its
// text without a model call. Written from the same facts, and put through the same checks as a real reply. About one drive in
// three (by a hash of its start; demo drives start on round half hours) has none, so the demo also shows
// the code sentences a drive has until its wording is written.

function summary(f: DriveFacts): string | null {
  // One sentence on why, as the model writes it: the tiles above already give the figures.
  const climbs = f.grade?.climbs;
  if (climbs) return `Most of the energy went on the climbs, the steepest ${climbs.steepest} at ${climbs.at}.`;
  if (f.power?.regen) return `Regen won back ${f.power.regen} on the way.`;
  if (f.hard && f.hard.brakeTimes.length > 0) return `The hard braking at ${f.hard.brakeTimes[0]} cost a little extra.`;
  return null;
}

export function demoHasWording(start: number): boolean {
  let h = 0;
  for (const c of String(start)) h = (h * 31 + c.charCodeAt(0)) % 1009;
  return h % 3 !== 0;
}

export function demoWording(facts: DriveFacts, start: number): DriveWords | null {
  if (!demoHasWording(start)) return null;
  return checkWording({ summary: summary(facts) }, facts);
}
