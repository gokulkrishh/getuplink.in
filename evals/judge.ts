// A stronger model grades one line of AI text against what the writer was given. It sees the same figures and
// hints the writer saw, never anything else.
import { modelFindings, type Finding, type TipCar } from "@/lib/ai-tips";
import type { DriveFacts } from "@/lib/drive-facts";
import type { Judge } from "./checks";

export const JUDGE_MODEL = "anthropic/claude-opus-5.5";
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM = `You grade one line of text written for the owner of a Tesla in India, in an app called Uplink. A smaller model wrote it from the facts you are given.

Return:
- "grounded": true only when every number and every claim in the line is supported by the facts, including a finding's hint. A cause, a reason or a comparison the facts don't hold makes it false. General advice taken from a hint counts as supported. Reading a figure the wrong way round (more for less) makes it false.
- "useful": 1 to 3. 1 = restates a figure with nothing to learn or do, or the advice is empty. 2 = fine. 3 = tells the owner something clear and worth acting on.
- "plain": 1 to 3. 1 = jargon or hard to follow. 2 = understandable. 3 = reads the way a calm friend who owns a Tesla would say it: everyday words, one idea per sentence, no hype.
- "why": one short sentence naming the biggest problem, or what works.

The owner has never seen code. Words like telemetry, median, stream, readings or API are not plain.`;

const SCHEMA = {
  type: "object",
  properties: { grounded: { type: "boolean" }, useful: { type: "integer", enum: [1, 2, 3] }, plain: { type: "integer", enum: [1, 2, 3] }, why: { type: "string" } },
  required: ["grounded", "useful", "plain", "why"],
  additionalProperties: false,
} as const;

export type Subject = { kind: "tips"; finding: Finding; car: TipCar; text: string } | { kind: "drive"; facts: DriveFacts; text: string };

export function judgeRequest(s: Subject) {
  const given =
    s.kind === "tips"
      ? `The writer's facts, as JSON:\n${JSON.stringify(modelFindings([s.finding])[0])}\n\nThe car: ${s.car ? `${s.car.name}, ${s.car.lfp ? "LFP" : "NMC"} battery` : "not known"}.`
      : `The writer's facts about one drive, as JSON:\n${JSON.stringify(s.facts)}`;
  return {
    model: JUDGE_MODEL,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `${given}\n\nThe line to grade:\n${s.text}` },
    ],
    reasoning: { effort: "low" },
    response_format: { type: "json_schema", json_schema: { name: "grade", strict: true, schema: SCHEMA } },
    provider: { data_collection: "deny" },
    max_tokens: 2000,
  };
}

export function parseJudge(content: string): Judge | null {
  try {
    const j = JSON.parse(content) as Partial<Judge>;
    const rating = (n: unknown) => typeof n === "number" && n >= 1 && n <= 3;
    return typeof j.grounded === "boolean" && rating(j.useful) && rating(j.plain) && typeof j.why === "string" ? { grounded: j.grounded, useful: j.useful!, plain: j.plain!, why: j.why } : null;
  } catch {
    return null;
  }
}

export async function judge(s: Subject, key: string): Promise<{ ok: true; judge: Judge; costUsd: number } | { ok: false; error: string }> {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "Uplink eval" },
      body: JSON.stringify(judgeRequest(s)),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return { ok: false, error: `OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}` };
    const body = (await res.json()) as { choices?: { message?: { content?: string | null } }[]; usage?: { cost?: number | null } };
    const graded = parseJudge(body.choices?.[0]?.message?.content ?? "");
    return graded ? { ok: true, judge: graded, costUsd: body.usage?.cost ?? 0 } : { ok: false, error: "reply didn't parse" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
