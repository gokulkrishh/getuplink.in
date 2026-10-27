// AI tips, the one way every page writes them: code finds, AI words. Each surface (Home's week, a drive, Stats
// > Charging, one charge) works out "findings" from the owner's own data, each a small set of figures already
// formatted as the app shows them ("₹16.52/kWh", "14 min"). The model gets only the top few and writes up to
// MAX_TIPS short tips from them. Every tip is checked before it shows: the style rules hold, it says nothing
// about the writer or the input, and every number in it is one the findings sent hold. A tip that fails isn't
// shown. Pure, so the prompt and the checks are tested (test/ai-tips.test.ts); lib/server/ai-tips.ts makes the
// call and stores the tips.
import { z } from "zod";
import { numbersIn, WORDING_MODEL } from "@/lib/drive-wording";
import type { PastVotes } from "@/lib/tip-votes";

export const MAX_TIPS = 3;
// The longest tip that fits the box's 5 lines on a phone and 3 on a wider screen (components/home/week-tips.tsx).
export const MAX_CHARS = 160;
// The model sees at most this many findings, the most useful first.
export const MAX_FINDINGS = 5;

type Fact = string | number | boolean | null | { [key: string]: Fact } | Fact[];

// One thing worth a tip. facts: figures as the app shows them, never raw numbers to work from. hint: the
// general reason or what to do, written by code, so the model never brings advice of its own. say: a plain
// code sentence for demo mode, which calls no model. score: how much it matters, see IMPACT. causes: what the
// car's own data shows was going on (Sentry Mode on, a fast stretch); a tip names a cause only when its finding
// holds it, so it never tells the owner to turn off something they never had on.
export type Finding = {
  kind: string;
  score: number;
  facts: Record<string, Fact>;
  hint?: string;
  say: string;
  causes?: Cause[];
};

// Causes a tip may name, and the words that name each.
export const CAUSE_WORDS = {
  sentry: /\bsentry\b/i,
  climateKeeper: /\b(climate keeper|dog mode|camp mode|keep climate)\b/i,
  overheat: /\boverheat\w*\b/i,
  climate: /\b(air[ -]?con\w*|cooling|heating|heater|climate control|cabin temperature)\b/i,
  apps: /\bapps?\b/i,
  speed: /\b(speeds?|faster|slower|drag|highway)\b/i,
} as const;
export type Cause = keyof typeof CAUSE_WORDS;

// A cause the tip names that its finding doesn't hold, or null.
export function unshownCause(text: string, finding: Pick<Finding, "causes">): Cause | null {
  for (const [cause, words] of Object.entries(CAUSE_WORDS) as [Cause, RegExp][]) if (words.test(text) && !finding.causes?.includes(cause)) return cause;
  return null;
}

// Ranking: money or minutes the owner could save first (by how much), then a big change against their usual
// (by how big), then plain facts worth knowing.
export const IMPACT = {
  saves: (amount: number) => 2000 + amount,
  change: (percent: number) => 1000 + percent,
  info: (weight: number) => weight,
};

// Where tips show. version: bumped when the prompt or a surface's findings change shape, so stored tips are
// written again. context: what the owner is looking at, for the prompt.
export type TipSurface = {
  scope: TipScope;
  version: number;
  context: string;
  // The page has a period switch: a tip never names a period ("this week").
  noPeriod?: boolean;
};

export type TipScope = "week" | "drive_tips" | "trip_tips" | "charging" | "charge" | "battery";

// One tip as shown, with the kind of finding it came from, so the owner's votes count against that kind.
export type Tip = { kind: string; text: string };

// The owner's votes so far turn the ranking: each net vote for a kind (useful minus not useful, on this kind
// of page) moves its findings by VOTE_WEIGHT, so a liked kind can pass a plain fact and a disliked one sinks.
// At DROP_AT net votes against, the kind isn't sent any more.
export const VOTE_WEIGHT = 300;
export const DROP_AT = -3;

export function rankWithVotes(findings: Finding[], net: Readonly<Record<string, number>>): Finding[] {
  return findings.flatMap((f) => {
    const n = net[f.kind] ?? 0;
    if (n <= DROP_AT) return [];
    return [{ ...f, score: f.score + Math.max(DROP_AT, Math.min(3, n)) * VOTE_WEIGHT }];
  });
}

// The findings sent: the top MAX_FINDINGS by score, ties kept in the order found.
export function topFindings(findings: Finding[]): Finding[] {
  return findings
    .map((f, k) => ({ f, k }))
    .sort((a, b) => b.f.score - a.f.score || a.k - b.k)
    .slice(0, MAX_FINDINGS)
    .map(({ f }) => f);
}

// What the model sees for each finding: its kind, its figures and its hint. Never the score or the demo line.
export function modelFindings(sent: Finding[]) {
  return sent.map((f) => ({ kind: f.kind, ...f.facts, ...(f.hint ? { hint: f.hint } : {}) }));
}

export function systemPrompt(surface: TipSurface): string {
  return `You write tips for a Tesla owner in Uplink, an app for owners in India. ${surface.context}

You get findings as JSON, the most useful first. Each has a "kind", figures from the owner's own data, and sometimes a "hint": the general reason behind it or what helps. Write "tips": up to ${MAX_TIPS} tips, each one or two short sentences, that tell the owner what to do and why, using the figures. One tip per finding, in the order given. Give each tip as {"kind": the kind of the finding it comes from, "text": the tip}. Fewer good tips beat weak ones. With nothing worth saying, return an empty list.

Rules:
- Plain and short, the way a calm friend who owns a Tesla would say it. Lead with what to do when there is something to do. No hype, no exclamation marks, no emoji, no greeting, no semicolons.
- Use only the findings. Never talk about "the findings", "the data" or yourself.
- Copy every number exactly as it is written, with its unit. Never work out a new number: no sums, differences, averages, ratios or rounding. Write every count in digits: "2 of your 4 trips", never "two of your four".
- Write a span like "58% to 51%" or "30 to 45 km/h", never with arrows or dashes.
- Keep each tip to 20 words or fewer: one short sentence with the figures, then at most one short sentence on what to do. Use only the part of a hint that fits.
- Any advice comes from a finding or its hint. Don't add advice of your own.
- Never guess why something happened, and never name a cause the finding doesn't hold (such as Sentry Mode, apps, air conditioning or speed). Never say how much a change would save beyond the figures given.
- Name a charging station or its town only as it is written. Don't name any other place, a person or the car.
- Nothing about the battery's health or wear, safety, tyre wear or the driver's skill.`;
}

export const TIPS_SCHEMA = {
  type: "object",
  properties: {
    tips: {
      type: "array",
      items: { type: "object", properties: { kind: { type: "string" }, text: { type: "string" } }, required: ["kind", "text"], additionalProperties: false },
    },
  },
  required: ["tips"],
  additionalProperties: false,
} as const;

// The owner's latest votes on this kind of page, as a note for the model: what to write more of and less of.
// Their numbers are an old day's, so they only steer the kind of tip, never a figure (the checks see to that).
export function votesNote(votes: PastVotes | null): string | null {
  if (!votes || (votes.useful.length === 0 && votes.notUseful.length === 0)) return null;
  const list = (tips: string[]) => tips.map((t) => `- ${t}`).join("\n");
  return [
    votes.useful.length > 0 && `Tips the owner found useful. Write more of this kind:\n${list(votes.useful)}`,
    votes.notUseful.length > 0 && `Tips the owner found not useful. Don't write tips like these:\n${list(votes.notUseful)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

// The request body for OpenRouter's chat completions: thinking off, strict JSON, and only providers that
// don't keep or train on the data.
export function tipsRequest(surface: TipSurface, sent: Finding[], votes: PastVotes | null = null) {
  const note = votesNote(votes);
  return {
    model: WORDING_MODEL,
    messages: [
      { role: "system", content: systemPrompt(surface) },
      ...(note ? [{ role: "system", content: note }] : []),
      { role: "user", content: JSON.stringify(modelFindings(sent)) },
    ],
    reasoning: { effort: "none" },
    response_format: { type: "json_schema", json_schema: { name: "tips", strict: true, schema: TIPS_SCHEMA } },
    provider: { data_collection: "deny" },
    max_tokens: 500,
  };
}

// Counts read as digits ("2 of your 4 trips"); "once" is fine. Ratio words are new figures on their own.
const NUMBER_WORDS = /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozen)\b/i;
const RATIO_WORDS = /\b(twice|double|doubled|triple|tripled|half|halved|thrice|quarter)\b/i;
// Talk about the input or the writer, or a greeting.
const OFF_LIST = /\b(sessions?|median|telemetry|stream\w*|readings?|signals?|API|OTA|firmware|pack|SoC|SoH)\b/i;
const META = /\b(facts?|findings?|data|hint|I|I'm|I'd|JSON|null|available|unavailable|missing|unknown|hello|hi|good (morning|afternoon|evening))\b/i;
// What a tip never claims: the battery's or tyres' wear, safety, the driver's skill.
const TOPIC = /\b(health|healthy|degrad\w*|wear\w*|worn|tread|grip|safe|safely|safety|unsafe|skill\w*)\b/i;
const TYRES = /\b(tyres?|tires?)\b/i;
// Findings that may name the tyres, for a rotation that's due.
const TYRE_KINDS = new Set(["tyreRotation"]);

const sentences = (text: string) => text.split(/(?<=[.?])\s+/).filter((s) => s.trim() !== "");

// Every value and hint in the sent findings, never their keys ("timeAbove80" doesn't make 80 a figure).
function values(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap(values);
  if (v && typeof v === "object") return Object.values(v).flatMap(values);
  return v === null || v === undefined ? [] : [String(v)];
}

// The numbers the sent findings hold, from their values and hints only.
export function knownNumbers(sent: Finding[]): Set<string> {
  return new Set(numbersIn(values(modelFindings(sent)).join(" | ")));
}

// A period named on a page whose period switch already names it (see TipSurface noPeriod).
const PERIOD = /\b(this|last|past) (week|month|year)\b|\b(today|yesterday)\b/i;

// Why a tip can't show, or null when it can.
export function tipProblem(text: string, sent: Finding[], known = knownNumbers(sent)): string | null {
  if (/[!;→←–—]|->/.test(text)) return "style";
  if (!/[.?]$/.test(text)) return "unfinished";
  if (META.test(text)) return "meta";
  // Words the app never shows an owner (the uplink-copy skill's list).
  if (OFF_LIST.test(text)) return "word";
  // "between 30 to 45 km/h": a span reads "30 to 45 km/h".
  if (/\bbetween\b[^.]*\bto\b/i.test(text)) return "style";
  if (sentences(text).length > 2) return "sentences";
  if (text.length > MAX_CHARS || text.split(/\s+/).length > 32) return "long";
  if (RATIO_WORDS.test(text) || NUMBER_WORDS.test(text)) return "number";
  if (TOPIC.test(text)) return "topic";
  if (TYRES.test(text) && !sent.some((f) => TYRE_KINDS.has(f.kind))) return "topic";
  for (const n of numbersIn(text)) if (!known.has(n)) return "number";
  return null;
}

const reply = z.object({ tips: z.array(z.object({ kind: z.string().trim(), text: z.string().trim().min(1).max(300) })).max(10) });

// The tips from a model reply (its JSON text, or the parsed object) that pass, at most MAX_TIPS. A tip must
// name the kind of a finding sent, at most one tip a kind.
export function checkTips(raw: unknown, sent: Finding[], surface?: TipSurface): Tip[] {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  const parsed = reply.safeParse(value);
  if (!parsed.success) return [];
  const known = knownNumbers(sent);
  const byKind = new Map(sent.map((f) => [f.kind, f]));
  const used = new Set<string>();
  const out: Tip[] = [];
  for (const t of parsed.data.tips) {
    const finding = byKind.get(t.kind);
    if (!finding || used.has(t.kind) || tipProblem(t.text, sent, known) !== null || unshownCause(t.text, finding) !== null) continue;
    if (surface?.noPeriod && PERIOD.test(t.text)) continue;
    used.add(t.kind);
    out.push(t);
  }
  return out.slice(0, MAX_TIPS);
}

// Demo mode calls no model: each sent finding's own code line, at most MAX_TIPS.
export function demoTips(sent: Finding[]): Tip[] {
  // A line that wouldn't fit the box (a long station name) is left out, as the checks leave out the AI's.
  return sent
    .filter((f) => f.say.length <= MAX_CHARS)
    .slice(0, MAX_TIPS)
    .map((f) => ({ kind: f.kind, text: f.say }));
}

// The findings sent, with the surface's version and the model, as one stable string (keys sorted): what a
// stored row's facts_hash is taken over, so new figures, a new prompt or a new model writes the tips again.
export function tipsKey(surface: TipSurface, sent: Finding[]): string {
  const sorted = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(sorted) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, sorted(x)])) : v;
  // By kind, so a vote that only reorders the same findings keeps the tips voted on.
  const byKind = modelFindings(sent).sort((a, b) => a.kind.localeCompare(b.kind));
  return JSON.stringify({ scope: surface.scope, v: surface.version, model: WORDING_MODEL, findings: sorted(byKind) });
}

// "1 charge", "3 charges".
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
