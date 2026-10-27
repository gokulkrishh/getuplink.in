import "server-only";
import type { DriveFacts, DriveWords } from "@/lib/drive-facts";
import { checkWording } from "@/lib/drive-wording";

// Stand-in AI wording for the demo car's drives, so the demo shows the sparkles mark and its text without a model
// call. Written from the same facts, and put through the same checks as a real reply. About one drive in
// three (by a hash of its start; demo drives start on round half hours) has none, so the demo also shows
// the code sentences a drive has until its wording is written.

const and = (items: string[]) => (items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function summary(f: DriveFacts): string | null {
  const parts: string[] = [];
  const e = f.efficiency;
  if (e) {
    if (e.usual && e.vsUsual) {
      if (e.vsUsual.way === "close") parts.push(`This ${f.kind} used ${e.whPerKm}, about the same as your usual ${e.usual}.`);
      else parts.push(`This ${f.kind} used ${e.whPerKm}, ${e.vsUsual.by} ${e.vsUsual.way === "better" ? "less" : "more"} than your usual ${e.usual}.`);
    } else parts.push(`This ${f.kind} used ${e.whPerKm} over ${f.distance}.`);
  }
  const h = f.hard;
  if (h) {
    const counted = [h.brakes > 0 ? plural(h.brakes, "hard brake") : null, h.starts > 0 ? plural(h.starts, "hard start") : null].filter((x): x is string => x !== null);
    if (counted.length === 0) parts.push("You drove smoothly, with no hard brakes or starts.");
    else if (h.usual !== null) parts.push(`There ${h.brakes + h.starts === 1 ? "was" : "were"} ${and(counted)}, ${h.vsUsual === "more than usual" ? "more than" : "no more than"} your usual ${h.usual}.`);
    else parts.push(`There ${h.brakes + h.starts === 1 ? "was" : "were"} ${and(counted)}.`);
  }
  return parts.length ? parts.join(" ") : null;
}

function lines(f: DriveFacts): DriveWords {
  const out: DriveWords = {};
  if (f.speed) out.speed = f.speed.mostly ? `You topped out at ${f.speed.top} and spent most of the time at ${f.speed.mostly}.` : `You topped out at ${f.speed.top}.`;
  if (f.power) out.power = f.power.regen ? `The battery gave about ${f.power.drawn}, and regen won ${f.power.regen} of it back.` : `The battery gave about ${f.power.drawn}, with nothing back from regen.`;
  if (f.hard) {
    const at = (times: string[], what: string) => (times.length ? `${what} at ${and(times)}` : null);
    const said = [at(f.hard.brakeTimes, "braked hard"), at(f.hard.startTimes, "pulled away hard")].filter(Boolean);
    out.acceleration = said.length ? `You ${said.join(", and ")}.` : "No hard brakes or hard starts this time.";
  }
  if (f.grade) {
    const steep = f.grade.climbs ?? f.grade.descents;
    out.grade = f.grade.flat ? "The road stayed flat the whole way." : steep ? `The steepest ${f.grade.climbs ? "climb" : "descent"} was ${steep.steepest}, at ${steep.at}.` : "The road was mostly flat.";
  }
  if (f.battery) out.battery = `The battery went from ${f.battery.start} to ${f.battery.end} over ${f.distance}.`;
  return out;
}

export function demoHasWording(start: number): boolean {
  let h = 0;
  for (const c of String(start)) h = (h * 31 + c.charCodeAt(0)) % 1009;
  return h % 3 !== 0;
}

export function demoWording(facts: DriveFacts, start: number): DriveWords | null {
  if (!demoHasWording(start)) return null;
  const written: DriveWords = { ...lines(facts) };
  const s = summary(facts);
  if (s) written.summary = s;
  return checkWording(Object.fromEntries((["summary", "speed", "power", "acceleration", "grade", "battery"] as const).map((k) => [k, written[k] ?? null])), facts);
}
