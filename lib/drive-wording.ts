// The drive page's words written by AI: "How this drive went" and the line under each chart, from the
// facts lib/drive-facts.ts builds. Pure, so the prompt, the schema and the checks are tested
// (test/drive-wording.test.ts); lib/server/drive-wording.ts makes the call and stores the result.
//
// Every line the model writes is checked before it shows: it parses, it keeps to the style (no "!",
// arrows or dashes, the sentence count), it only names the usual when there is one, and every number in it
// is one the facts hold. A line that fails falls back to its code sentence, on its own.
import { z } from "zod";
import type { DriveFacts, DriveWords, WordingField } from "@/lib/drive-facts";

export const WORDING_MODEL = "anthropic/claude-haiku-5.5";
// Bumped when the prompt or the facts' shape changes, so stored wording is written again.
export const PROMPT_VERSION = 5;
// OpenRouter's list price for the model, per token, for when a reply leaves out its cost.
export const PRICE_PER_TOKEN = { input: 0.1 / 1e6, output: 0.5 / 1e6 };

export const SYSTEM_PROMPT = `You write the short text on a Tesla owner's drive page in Uplink, an app for owners in India.

You get one drive's facts as JSON. Write:
- "summary": one sentence on WHY the drive used the energy it did, shown under tiles that already give the Wh/km, the usual and the hard-moment counts. Don't repeat those figures. Point to what in the facts most likely explains it: climbs or descents and when, regen won back, speed, or hard moments and when. If nothing in the facts explains it, set it to null.

Rules:
- Plain, short sentences, the way a calm friend would say it. No hype, no exclamation marks, no emoji.
- Mention only the facts given. A null or missing fact is simply not mentioned: never say what is missing, and never talk about "the facts", "the data" or yourself.
- Copy every number exactly as it appears in the facts, with its unit. Never work out a new number: no sums, differences, averages, ratios or rounding, and don't spell numbers as words.
- When "usual" is null, don't compare with the usual and don't use the word "usual". When only one part has a usual, compare only that part and state the other plainly, without saying there's nothing to compare it with.
- Write levels and spans like "58% to 51%" and "30 to 45 km/h" (never "between 30 to 45"). Never use arrows, dashes or en dashes for a span.
- Times are 12-hour, as given, like "7:15 AM".
- No advice, and nothing about the car's health, the battery's health, safety or the driver's skill.
- Don't name places, people or the car.`;

// Every field is sent as required and nullable: strict structured output handles that more reliably than
// optional properties. A null is a line not written.
// The AI writes only the summary, the "why" under the tiles: the lines under the charts restate what the
// chart shows, which the code says exactly.
const FIELDS = ["summary"] as const satisfies readonly WordingField[];
export const RESPONSE_SCHEMA = {
  type: "object",
  properties: Object.fromEntries(FIELDS.map((f) => [f, { type: ["string", "null"] }])),
  required: [...FIELDS],
  additionalProperties: false,
} as const;

const line = z.string().trim().min(1).max(300).nullish();
export const wordingSchema = z.object(Object.fromEntries(FIELDS.map((f) => [f, line])) as Record<WordingField, typeof line>);

// The request body for OpenRouter's chat completions: thinking off, strict JSON, and only providers that
// don't keep or train on the data. No temperature: the model's default.
export function wordingRequest(facts: DriveFacts) {
  return {
    model: WORDING_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(facts) },
    ],
    reasoning: { effort: "none" },
    response_format: { type: "json_schema", json_schema: { name: "drive_wording", strict: true, schema: RESPONSE_SCHEMA } },
    provider: { data_collection: "deny" },
    max_tokens: 400,
  };
}

// The numbers in a text: a clock time ("7:15") as one token, so its minutes can't stand in for an invented
// figure; otherwise a number with any Indian grouping commas dropped ("1,234.5" is "1234.5").
export function numbersIn(text: string): string[] {
  return (text.match(/\d{1,2}:\d{2}|\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => (n.includes(":") ? n : n.replace(/,/g, "")));
}

// Number words a model might write for a count; each must stand for a number the facts hold. Ratio words
// are new figures on their own, so they never pass.
const NUMBER_WORDS: Record<string, string> = { two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10", eleven: "11", twelve: "12" };
const RATIO_WORDS = /\b(twice|double|doubled|triple|tripled|half|halved|thrice)\b/i;

// The numbers the facts hold, from every value in them (the keys hold none).
function factNumbers(facts: DriveFacts): Set<string> {
  return new Set(numbersIn(JSON.stringify(facts)));
}

const sentences = (text: string) => text.split(/(?<=[.?])\s+/).filter((s) => s.trim() !== "");

// The figures the page already shows above the summary (its tiles and the trip line), with their units: a
// summary that repeats one says nothing new. Counts match as "2 hard", "2 stops".
function repeatsShown(text: string, facts: DriveFacts): boolean {
  const shown = [facts.distance, facts.took, facts.efficiency?.whPerKm, facts.efficiency?.usual, facts.battery?.start, facts.battery?.end, facts.battery?.used, facts.energyUsed];
  const counts = facts.hard ? [`${facts.hard.brakes} hard`, `${facts.hard.starts} hard`] : [];
  // Battery levels and % changes are left out: a climb's "5%" isn't the battery's 5%.
  const figures = [...shown, ...counts, facts.stops > 0 ? `${facts.stops} stop` : null].filter((f): f is string => f != null && !f.endsWith("%"));
  return figures.some((f) => new RegExp(`(^|[^\\d.,])${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(text));
}

// Why a line can't show, or null when it can.
export function lineProblem(field: WordingField, text: string, facts: DriveFacts, known = factNumbers(facts)): string | null {
  if (/[!→←–—]|->/.test(text)) return "style";
  // The summary only adds why: a number the tiles already show means it's restating them.
  if (field === "summary" && repeatsShown(text, facts)) return "repeats";
  if (!/[.?]$/.test(text)) return "unfinished";
  // Talk about the input or the writer ("The facts don't include…", "I can't say"), not the drive.
  if (/\b(facts?|data|I|I'm|I'd|JSON|null|available|unavailable|missing|unknown)\b/.test(text)) return "meta";
  if (/\bno usual\b|\bnothing to compare\b/i.test(text)) return "meta";
  // "between 28 to 68 km/h": the span reads "28 to 68 km/h".
  if (/\bbetween\b[^.]*\bto\b/i.test(text)) return "style";
  const n = sentences(text).length;
  if (n !== 1) return "sentences";
  const hasUsual = facts.efficiency?.usual != null || facts.hard?.usual != null;
  if (!hasUsual && /\busual\b/i.test(text)) return "usual";
  if (RATIO_WORDS.test(text)) return "number";
  for (const word of text.toLowerCase().match(/\b[a-z]+\b/g) ?? []) if (NUMBER_WORDS[word] && !known.has(NUMBER_WORDS[word])) return "number";
  for (const number of numbersIn(text)) if (!known.has(number)) return "number";
  return null;
}

// The lines from a model reply (its JSON text, or the parsed object) that pass every check: the summary
// when the page has one. Null when the reply doesn't parse.
export function checkWording(reply: unknown, facts: DriveFacts): DriveWords | null {
  let value = reply;
  if (typeof reply === "string") {
    try {
      value = JSON.parse(reply);
    } catch {
      return null;
    }
  }
  const parsed = wordingSchema.safeParse(value);
  if (!parsed.success) return null;
  const known = factNumbers(facts);
  const allowed = new Set<WordingField>(["summary", ...facts.charts]);
  const out: DriveWords = {};
  for (const field of FIELDS) {
    const text = parsed.data[field];
    if (text && allowed.has(field) && lineProblem(field, text, facts, known) === null) out[field] = text;
  }
  return out;
}

export type ShownLine = { text: string; ai: boolean };

// What each line on the page shows: the AI's line where it has one that passed its checks and the code
// has a sentence there too, otherwise the code sentence (no AI mark).
export function pickWords(code: DriveWords, ai: DriveWords | null): Partial<Record<WordingField, ShownLine>> {
  const out: Partial<Record<WordingField, ShownLine>> = {};
  for (const field of Object.keys(code) as WordingField[]) {
    const own = code[field];
    if (!own) continue;
    const written = (FIELDS as readonly WordingField[]).includes(field) ? ai?.[field] : undefined;
    out[field] = written ? { text: written, ai: true } : { text: own, ai: false };
  }
  return out;
}

// The facts as one stable string (keys sorted), with the prompt version and the model: what the stored
// wording's facts_hash is taken over, so new facts, a new prompt or a new model writes it again.
export function factsKey(facts: DriveFacts): string {
  const sorted = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(sorted) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, sorted(x)])) : v;
  return JSON.stringify({ v: PROMPT_VERSION, model: WORDING_MODEL, facts: sorted(facts) });
}
