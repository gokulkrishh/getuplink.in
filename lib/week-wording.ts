// Home's AI tips under the tiles: up to three short tips on the last 7 days, from figures the code works
// out (weekFacts). Pure, so the prompt and the checks are tested (test/week-wording.test.ts);
// lib/server/week-wording.ts makes the call and stores them, once a day.
//
// As on the drive page (lib/drive-wording.ts): every number in a tip must be one the facts hold, the
// style rules hold, and a tip that fails isn't shown.
import { z } from "zod";
import { numbersIn, WORDING_MODEL } from "@/lib/drive-wording";
import type { Bill } from "@/lib/charging-figures";
import type { Drive } from "@/lib/drives";
import type { DrivingPeriod } from "@/lib/driving-figures";
import { formatKm, formatKwh, formatMoney } from "@/lib/format";
import type { Timeframe } from "@/lib/periods";
import { groupTrips } from "@/lib/trips";

export const WEEK_PROMPT_VERSION = 5;
export const MAX_TIPS = 3;

// Only figures: no places, car, account or clock times.
export type WeekFacts = {
  distance: string | null;
  distanceWeekBefore: string | null;
  trips: number;
  // Trips under SHORT_KM: a cold start costs more per km on a short trip.
  shortTrips: number;
  energyUsed: string | null;
  efficiency: string | null;
  efficiencyWeekBefore: string | null;
  charges: number;
  energyAdded: string | null;
  spent: string | null;
  // What each kWh the car took in cost, where the charges have bills and kWh.
  costPerKwh: string | null;
};

const SHORT_KM = 5;
const whPerKm = (n: number | null) => (n === null ? null : `${Math.round(n)} Wh/km`);

export function weekFacts(frame: Timeframe, driving: DrivingPeriod | null, drives: Drive[], bills: Bill[], energyAdded: number): WeekFacts {
  const { span } = frame;
  const inSpan = (t: number) => t >= span.from && t < span.to;
  const trips = groupTrips(drives.filter((d) => inSpan(d.start)));
  const billed = bills.filter((b) => inSpan(Date.parse(b.started_at)));
  const spent = billed.reduce((a, b) => a + b.cost, 0);
  return {
    distance: driving?.current.km ? formatKm(driving.current.km) : null,
    distanceWeekBefore: driving?.previous?.km ? formatKm(driving.previous.km) : null,
    trips: trips.length,
    shortTrips: trips.filter((t) => t.km < SHORT_KM).length,
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

export const WEEK_SYSTEM_PROMPT = `You write tips on a Tesla owner's home page in Uplink, an app for owners in India. They sit under four tiles that show the week's distance, energy used, energy added and spend, and a chart of distance per day.

You get the last 7 days' facts as JSON. Write "tips": up to ${MAX_TIPS} tips, each one or two short sentences, that tell the owner something the tiles and chart don't: how efficiency compares with the week before and what usually moves it (speed, short trips, climate), what charging cost per kWh, or a habit worth knowing. Tie each tip to a fact. Fewer good tips beat three weak ones; with nothing worth saying, return an empty list.

Rules:
- Plain and short, the way a friend who owns a Tesla would say it. No hype, no exclamation marks, no emoji, no greeting.
- Use only the facts given. A null or missing fact is simply not mentioned: never talk about "the facts", "the data" or yourself.
- Copy every number exactly as it appears in the facts, with its unit. Never work out a new number: no sums, differences, averages, ratios or rounding, and write every count in digits: "2 of your 4 trips", never "two of your four".
- Don't repeat a day's distance: the chart shows it.
- Nothing about the battery's health, safety, tyres or the driver's skill. Don't name places, people or the car.`;

export const WEEK_SCHEMA = {
  type: "object",
  properties: { tips: { type: "array", items: { type: "string" } } },
  required: ["tips"],
  additionalProperties: false,
} as const;

// What the model sees: the facts without the four totals the tiles show so the tips say something they don't. The week before's distance stays, to compare with.
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
    response_format: { type: "json_schema", json_schema: { name: "week_tips", strict: true, schema: WEEK_SCHEMA } },
    provider: { data_collection: "deny" },
    max_tokens: 400,
  };
}

// Counts read as digits ("2 of your 4 trips"); "once" is fine.
const NUMBER_WORDS = /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i;
const RATIO_WORDS =/\b(twice|double|doubled|triple|tripled|half|halved|thrice)\b/i;

// Why a tip can't show, or null when it can.
export function tipProblem(text: string, facts: WeekFacts): string | null {
  if (/[!→←–—]|->/.test(text)) return "style";
  if (!/[.?]$/.test(text)) return "unfinished";
  if (/\b(facts?|data|I|I'm|JSON|null|available|missing|unknown|hello|hi|good (morning|afternoon|evening))\b/i.test(text)) return "meta";
  if (text.split(/(?<=[.?])\s+/).filter(Boolean).length > 2) return "sentences";
  if (text.split(/\s+/).length > 35) return "long";
  if (RATIO_WORDS.test(text) || NUMBER_WORDS.test(text)) return "number";
  if (/\b(health|degrad|safe|safety|tyres?|tires?)/i.test(text)) return "topic";
  const known = new Set(numbersIn(JSON.stringify(modelFacts(facts))));
  for (const n of numbersIn(text)) if (!known.has(n)) return "number";
  return null;
}

const reply = z.object({ tips: z.array(z.string().trim().min(1).max(300)).max(10) });

// The tips from a model reply (its JSON text, or the parsed object) that pass, at most MAX_TIPS.
export function checkWeekTips(raw: unknown, facts: WeekFacts): string[] {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  const parsed = reply.safeParse(value);
  return parsed.success ? parsed.data.tips.filter((t) => tipProblem(t, facts) === null).slice(0, MAX_TIPS) : [];
}

export function weekFactsKey(facts: WeekFacts): string {
  return JSON.stringify({ v: WEEK_PROMPT_VERSION, model: WORDING_MODEL, facts });
}
