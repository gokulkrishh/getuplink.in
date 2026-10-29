import "server-only";
import { type Finding, modelFindings } from "@/lib/ai-tips";
import type { BlockedTip, JevVerdict } from "@/lib/jev-checks";
import { DEMO } from "@/lib/demo";
import type { NudgeFigures } from "@/lib/share-nudge";

// A second look at each AI tip by TypeSafe's Jev, a decision model on OpenRouter's Decisions API
// (https://openrouter.ai/docs/guides/community/jev): given the findings the tip writer got and the tip, the
// probability that the tip states a cause, fact or number the findings don't show. From BLOCK_FROM the tip is
// dropped. Below it, or when Jev doesn't answer, the tip goes through (the code checks in lib/ai-tips.ts still
// apply). Every verdict is kept with its tip for Admin > Feedback > Tip votes.
//
// Jev sees only what the writer saw (modelFindings: figures as the app shows them, never location, place
// names, VIN or anything naming the owner) and the tip. Never called in demo mode, without
// OPENROUTER_API_KEY, or with JEV_OFF set. Only tips being written are checked, never on a page view.

const ENDPOINT = "https://openrouter.ai/api/alpha/decisions";
// The alias that tracks Jev's newest release, as the docs name it.
export const JEV_MODEL = "~typesafe/jev-latest";
const TIMEOUT_MS = 3_000;
// From this probability of "yes, it says something unshown", a tip is blocked.
export const BLOCK_FROM = 0.9;

const QUESTION = "unsupported";

export const jevOn = () => !DEMO && !process.env.JEV_OFF?.trim() && Boolean(process.env.OPENROUTER_API_KEY?.trim());

// Station, town and area names in the findings (charge tips name them) never reach Jev: each becomes the same
// numbered token in the findings and in the tip ("[place 1]"), so Jev can still see that the tip's place is one
// the findings hold.
const PLACE_KEY = /station|town|area|place|name|site|location|address|city/i;

export function placeTokens(findings: Finding[]): Map<string, string> {
  const names = new Set<string>();
  const walk = (v: unknown, key: string): void => {
    if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => walk(x, k));
    else if (typeof v === "string" && v.trim().length > 1 && PLACE_KEY.test(key)) names.add(v.trim());
  };
  findings.forEach((f) => walk(f.facts, ""));
  // Longest first, so "VoltPoint, Lakeview Fuels" goes before a "Lakeview" inside it.
  return new Map([...names].sort((a, b) => b.length - a.length).map((n, k) => [n, `[place ${k + 1}]`]));
}

export function hidePlaces<T>(value: T, tokens: Map<string, string>): T {
  if (typeof value === "string") return [...tokens].reduce((t, [name, token]) => t.split(name).join(token), value as string) as T;
  if (Array.isArray(value)) return value.map((x) => hidePlaces(x, tokens)) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, hidePlaces(x, tokens)])) as T;
  return value;
}

export function jevRequest(findings: Finding[], tip: string) {
  const tokens = placeTokens(findings);
  return {
    model: JEV_MODEL,
    state: { findings: hidePlaces(modelFindings(findings), tokens), tip: hidePlaces(tip, tokens) },
    questions: {
      [QUESTION]: {
        type: "noul",
        instructions:
          "The tip was written for a Tesla owner from the findings only. Does the tip state a cause, fact or number that the findings don't show? General advice taken from a finding's hint counts as shown.",
        criteria: {
          true: "The tip names a cause, fact or number that isn't in the findings or their hints.",
          false: "Everything the tip says is in the findings or their hints.",
        },
      },
    },
    // As the tip writer: only providers that don't keep or train on it.
    provider: { data_collection: "deny" },
  };
}

// The verdict in a Decisions response, or null when it isn't one.
export function parseJev(body: unknown, at = Date.now()): JevVerdict | null {
  const b = body as { model?: unknown; answers?: Record<string, { type?: unknown; noul?: unknown }>; usage?: { cost?: unknown } } | null;
  const answer = b?.answers?.[QUESTION];
  const p = answer?.noul;
  if (answer?.type !== "noul" || typeof p !== "number" || !Number.isFinite(p) || p < 0 || p > 1) return null;
  return {
    unsupported: p >= BLOCK_FROM,
    p,
    at: new Date(at).toISOString(),
    model: typeof b?.model === "string" ? b.model : JEV_MODEL,
    cost: typeof b?.usage?.cost === "number" ? b.usage.cost : 0,
  };
}

// Jev's verdict on one tip, or null when it can't be had (off, an error, over TIMEOUT_MS). Never throws.
export async function checkTip({ findings, tip }: { findings: Finding[]; tip: string }): Promise<JevVerdict | null> {
  if (!jevOn()) return null;
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY?.trim()}`, "Content-Type": "application/json", "X-Title": "Uplink" },
      body: JSON.stringify(jevRequest(findings, tip)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn("Jev check unavailable: OpenRouter", res.status);
      return null;
    }
    return parseJev(await res.json());
  } catch {
    return null;
  }
}

export type JevResult<T> = { tips: (T & { jev?: JevVerdict | null })[]; blocked: BlockedTip[]; cost: number; at: string | null };

// Checks every tip in parallel. tips: the ones that go through, each with its verdict (null when Jev didn't
// answer; no jev key when Jev is off). blocked: the ones Jev blocked. at: when the check ran, null when off.
export async function checkTipsWithJev<T extends { kind: string; text: string }>(tips: T[], findings: Finding[]): Promise<JevResult<T>> {
  if (!jevOn() || tips.length === 0) return { tips, blocked: [], cost: 0, at: null };
  const at = new Date().toISOString();
  const verdicts = await Promise.all(tips.map((t) => checkTip({ findings, tip: t.text })));
  const out: JevResult<T> = { tips: [], blocked: [], cost: 0, at };
  tips.forEach((t, k) => {
    const v = verdicts[k];
    out.cost += v?.cost ?? 0;
    if (v?.unsupported) out.blocked.push({ kind: t.kind, text: t.text, p: v.p, at: v.at });
    else out.tips.push({ ...t, jev: v });
  });
  return out;
}

// ---- The share card's daily decision (lib/share-nudge.ts, lib/server/share-nudge.ts) ----
// Whether comparing with other owners would interest this owner this week, from a few of their figures:
// numbers only (NudgeFigures), never location, place names, VIN or anything naming the owner.

const SHARE_QUESTION = "interesting";

export function shareNudgeRequest(figures: NudgeFigures) {
  return {
    model: JEV_MODEL,
    state: { figures },
    questions: {
      [SHARE_QUESTION]: {
        type: "noul",
        instructions:
          "These are one Tesla owner's driving figures: this week against their own usual weeks. Uplink can show them how their car compares with other owners' cars (totals across at least 5 cars). Would that comparison be interesting for this owner this week?",
        criteria: {
          true: "This week has something an owner would want to compare, such as more driving than usual or energy use that changed.",
          false: "This week is too quiet or too ordinary for a comparison to be interesting.",
        },
      },
    },
    provider: { data_collection: "deny" },
  };
}

// Jev's probability of "yes, interesting", or null when it can't be had (off, an error, a bad answer, over
// TIMEOUT_MS). Never throws.
export async function askShareInterest(figures: NudgeFigures): Promise<number | null> {
  if (!jevOn()) return null;
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY?.trim()}`, "Content-Type": "application/json", "X-Title": "Uplink" },
      body: JSON.stringify(shareNudgeRequest(figures)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn("Jev share decision unavailable: OpenRouter", res.status);
      return null;
    }
    const body = (await res.json()) as { answers?: Record<string, { type?: unknown; noul?: unknown }> } | null;
    const answer = body?.answers?.[SHARE_QUESTION];
    const p = answer?.noul;
    return answer?.type === "noul" && typeof p === "number" && Number.isFinite(p) && p >= 0 && p <= 1 ? p : null;
  } catch {
    return null;
  }
}
