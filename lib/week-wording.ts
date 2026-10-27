// Home's AI line under the greeting: one sentence on how the last 7 days went, from figures the code works
// out (weekFacts). Pure, so the prompt and the checks are tested (test/week-wording.test.ts);
// lib/server/week-wording.ts makes the call and stores it, once a day.
//
// As on the drive page (lib/drive-wording.ts): every number in the line must be one the facts hold, the
// style rules hold, and a line that fails isn't shown.
import { z } from "zod";
import { numbersIn, WORDING_MODEL } from "@/lib/drive-wording";
import type { Bill } from "@/lib/charging-figures";
import type { Drive } from "@/lib/drives";
import type { DrivingPeriod } from "@/lib/driving-figures";
import { formatKm, formatKwh, formatMoney } from "@/lib/format";
import type { Timeframe } from "@/lib/periods";
import { groupTrips } from "@/lib/trips";

export const WEEK_PROMPT_VERSION = 3;

// Only figures and weekday names: no places, car, account or clock times.
export type WeekFacts = {
  distance: string | null;
  distanceWeekBefore: string | null;
  // The days the car drove, with how far: "Friday", "46.6 km".
  drivenDays: { day: string; distance: string }[];
  trips: number;
  longestTrip: { distance: string; day: string } | null;
  energyUsed: string | null;
  efficiency: string | null;
  efficiencyWeekBefore: string | null;
  charges: number;
  energyAdded: string | null;
  spent: string | null;
  // What each kWh the car took in cost, where the charges have bills and kWh.
  costPerKwh: string | null;
};

const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "Asia/Kolkata" });
const day = (t: number) => weekday.format(t);
const whPerKm = (n: number | null) => (n === null ? null : `${Math.round(n)} Wh/km`);

export function weekFacts(frame: Timeframe, driving: DrivingPeriod | null, drives: Drive[], bills: Bill[], energyAdded: number): WeekFacts {
  const { span, slots } = frame;
  const inSpan = (t: number) => t >= span.from && t < span.to;
  const trips = groupTrips(drives.filter((d) => inSpan(d.start)));
  const longest = trips.reduce<(typeof trips)[number] | null>((a, t) => (t.km !== null && (a === null || (a.km ?? 0) < t.km) ? t : a), null);
  const billed = bills.filter((b) => inSpan(Date.parse(b.started_at)));
  const spent = billed.reduce((a, b) => a + b.cost, 0);
  return {
    distance: driving?.current.km ? formatKm(driving.current.km) : null,
    distanceWeekBefore: driving?.previous?.km ? formatKm(driving.previous.km) : null,
    drivenDays: (driving?.bars ?? []).flatMap((b, k) => (b.km && b.km >= 0.1 && slots[k] ? [{ day: day(slots[k].from + 43_200_000), distance: formatKm(b.km) }] : [])),
    trips: trips.length,
    longestTrip: longest?.km ? { distance: formatKm(longest.km), day: day(longest.start) } : null,
    energyUsed: driving?.current.kwh ? formatKwh(driving.current.kwh) : null,
    efficiency: whPerKm(driving?.current.whPerKm ?? null),
    efficiencyWeekBefore: whPerKm(driving?.previous?.whPerKm ?? null),
    charges: billed.length > 0 ? billed.length : 0,
    energyAdded: energyAdded > 0 ? formatKwh(energyAdded) : null,
    spent: spent > 0 ? formatMoney(spent, "INR") : null,
    costPerKwh: spent > 0 && energyAdded > 0 ? `${formatMoney(spent / energyAdded, "INR")}/kWh` : null,
  };
}

// Nothing worth a line: no driving and no charging.
export const quietWeek = (f: WeekFacts) => f.distance === null && f.energyAdded === null && f.spent === null;

export const WEEK_SYSTEM_PROMPT = `You write one line on a Tesla owner's home page in Uplink, an app for owners in India. It sits under a greeting and above four tiles that show the week's distance, energy used, energy added and spend.

You get the last 7 days' facts as JSON, without the four totals the tiles show. Write "line": one sentence on what stood out this week, the way a friend who looked at the numbers would put it. Pick one or two things: the busiest days, the longest trip, how efficiency compares with the week before, or what charging cost per kWh. If nothing stands out, set it to null.

Rules:
- Plain and short. No hype, no exclamation marks, no emoji, no greeting.
- Use only the facts given. A null or missing fact is simply not mentioned: never talk about "the facts", "the data" or yourself.
- Copy every number exactly as it appears in the facts, with its unit. Never work out a new number: no sums, differences, averages, ratios or rounding, and don't spell numbers as words.
- Days are weekday names as given, like "Friday". Put each day's distance right after its own day ("Friday's 46.6 km"); never pair them with "respectively".
- No advice, and nothing about the car's health, the battery's health, safety or the driver's skill.
- Don't name places, people or the car.`;

export const WEEK_SCHEMA = {
  type: "object",
  properties: { line: { type: ["string", "null"] } },
  required: ["line"],
  additionalProperties: false,
} as const;

// What the model sees: the facts without the four totals the tiles under the line already show, so the
// line says something they don't. The week before's distance stays, to compare with.
export function modelFacts(facts: WeekFacts) {
  const { distance: _d, energyUsed: _u, energyAdded: _a, spent: _s, ...rest } = facts;
  return rest;
}

export function weekRequest(facts: WeekFacts) {
  return {
    model: WORDING_MODEL,
    messages: [
      { role: "system", content: WEEK_SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(modelFacts(facts)) },
    ],
    reasoning: { effort: "none" },
    response_format: { type: "json_schema", json_schema: { name: "week_line", strict: true, schema: WEEK_SCHEMA } },
    provider: { data_collection: "deny" },
    max_tokens: 200,
  };
}

const RATIO_WORDS = /\b(twice|double|doubled|triple|tripled|half|halved|thrice)\b/i;

// Why the line can't show, or null when it can.
export function weekLineProblem(text: string, facts: WeekFacts): string | null {
  if (/[!→←–—]|->/.test(text)) return "style";
  if (!/[.?]$/.test(text)) return "unfinished";
  if (/\b(facts?|data|I|I'm|JSON|null|available|missing|unknown|hello|hi|good (morning|afternoon|evening))\b/i.test(text)) return "meta";
  if (text.split(/(?<=[.?])\s+/).filter(Boolean).length !== 1) return "sentences";
  if (text.split(/\s+/).length > 35) return "long";
  if (RATIO_WORDS.test(text)) return "number";
  if (/\brespectively\b/i.test(text)) return "pairing";
  const known = new Set(numbersIn(JSON.stringify(modelFacts(facts))));
  for (const n of numbersIn(text)) if (!known.has(n)) return "number";
  if (!distancesOnTheirDays(text, facts)) return "pairing";
  return null;
}

// Each distance in the line sits with a day it belongs to: a day's own total or the longest trip's day.
// The model has swapped them ("Friday and Monday, with 46.2 km and 46.6 km"), and both numbers exist, so
// the number check alone passes it.
function distancesOnTheirDays(text: string, facts: WeekFacts): boolean {
  const days = new Map<string, Set<string>>();
  const add = (day: string, km: string) => days.set(day, (days.get(day) ?? new Set()).add(km));
  for (const d of facts.drivenDays) add(d.day, d.distance);
  if (facts.longestTrip) add(facts.longestTrip.day, facts.longestTrip.distance);
  const dayAt = [...text.matchAll(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/g)].map((m) => ({ day: m[1], at: m.index ?? 0 }));
  for (const m of text.matchAll(/(\d[\d,]*(?:\.\d+)?) km\b/g)) {
    const km = `${m[1]} km`;
    const owners = [...days].filter(([, kms]) => kms.has(km)).map(([day]) => day);
    if (owners.length === 0 || dayAt.length === 0) continue;
    const nearest = dayAt.reduce((a, d) => (Math.abs(d.at - (m.index ?? 0)) < Math.abs(a.at - (m.index ?? 0)) ? d : a));
    if (!owners.includes(nearest.day)) return false;
  }
  return true;
}

const reply = z.object({ line: z.string().trim().min(1).max(300).nullable() });

// The line from a model reply (its JSON text, or the parsed object) when it passes, else null.
export function checkWeekLine(raw: unknown, facts: WeekFacts): string | null {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const parsed = reply.safeParse(value);
  const line = parsed.success ? parsed.data.line : null;
  return line && weekLineProblem(line, facts) === null ? line : null;
}

export function weekFactsKey(facts: WeekFacts): string {
  return JSON.stringify({ v: WEEK_PROMPT_VERSION, model: WORDING_MODEL, facts });
}
