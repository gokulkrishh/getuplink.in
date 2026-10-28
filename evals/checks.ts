// The eval's pure parts: reading a model reply, the checks that grade an output, wrong versions of a tip for
// Jev to catch, and the numbers a run reports. No network (test/ai-eval.test.ts).
import { checkTips, type Finding, tipProblem, unshownCause } from "@/lib/ai-tips";
import { copyViolations } from "@/lib/copy-rules";
import { lineProblem } from "@/lib/drive-wording";
import { type EvalCase, SURFACES } from "./cases";

export type Scope = Extract<EvalCase, { kind: "tips" }>["scope"] | "drive";
export type Judge = { grounded: boolean; useful: number; plain: number; why: string };
export type WrongTip = { how: "direction" | "cause"; text: string; p: number | null };

// One line of AI text, graded. code: "ok" or why the app's own checker drops it.
export type Output = {
  caseId: string;
  scope: Scope;
  findingKind: string | null;
  text: string;
  code: string;
  rules: string[];
  judge: Judge | null;
  jev: number | null;
  wrong: WrongTip[];
};

// What the model wrote, before the app's checks: lenient, so a line the checks drop can still be graded.
export function tipsIn(reply: string): { kind: string; text: string }[] {
  try {
    const tips = (JSON.parse(reply) as { tips?: unknown }).tips;
    return Array.isArray(tips) ? tips.filter((t): t is { kind: string; text: string } => typeof t?.kind === "string" && typeof t?.text === "string" && t.text.trim() !== "").map((t) => ({ kind: t.kind, text: t.text.trim() })) : [];
  } catch {
    return [];
  }
}

export function summaryIn(reply: string): string | null {
  try {
    const s = (JSON.parse(reply) as { summary?: unknown }).summary;
    return typeof s === "string" && s.trim() !== "" ? s.trim() : null;
  } catch {
    return null;
  }
}

// The app's own checker, per kind of case: "ok", or the reason it fails.
const CODE: { [K in EvalCase["kind"]]: (c: Extract<EvalCase, { kind: K }>, kind: string | null, text: string) => string } = {
  tips: (c, kind, text) => {
    const surface = SURFACES[c.scope];
    if (checkTips({ tips: [{ kind: kind ?? "", text }] }, c.findings, surface, c.car).length > 0) return "ok";
    const finding = c.findings.find((f) => f.kind === kind);
    if (!finding) return "kind";
    return tipProblem(text, c.findings) ?? (unshownCause(text, finding) ? "cause" : !finding.hint && /[.?]\s+\S/.test(text) ? "advice with no hint" : "full-charge advice or period");
  },
  drive: (c, _kind, text) => lineProblem("summary", text, c.facts) ?? "ok",
};

export function codeCheck(c: EvalCase, kind: string | null, text: string): string {
  return c.kind === "tips" ? CODE.tips(c, kind, text) : CODE.drive(c, kind, text);
}

export const rulesCheck = (text: string): string[] => copyViolations(text);

// Wrong versions of a tip that the app's checks let through: a direction word flipped, or a cause the
// findings don't hold added. Only the ones the code checker accepts are returned, since catching the rest is
// not Jev's job.
const OPPOSITE: Record<string, string> = { more: "less", less: "more", higher: "lower", lower: "higher", rose: "fell", fell: "rose", faster: "slower", slower: "faster", above: "below", below: "above", cheaper: "dearer", dearer: "cheaper", better: "worse", worse: "better" };
const DIRECTION = new RegExp(`\\b(${Object.keys(OPPOSITE).join("|")})\\b`, "i");
// None of these names a cause the code checker knows (lib/ai-tips.ts CAUSE_WORDS); each is dropped when a finding mentions its word.
const CAUSES: [clause: string, word: string][] = [
  ["because of heavy traffic", "traffic"],
  ["because it was raining", "rain"],
  ["because the car was left plugged in overnight", "plugged"],
];

export function flipDirection(text: string): string | null {
  const m = DIRECTION.exec(text);
  if (!m) return null;
  const opposite = OPPOSITE[m[0].toLowerCase()];
  return text.slice(0, m.index) + (m[0][0] === m[0][0].toUpperCase() ? opposite[0].toUpperCase() + opposite.slice(1) : opposite) + text.slice(m.index + m[0].length);
}

export function addCause(text: string, sent: Finding[]): string | null {
  const held = JSON.stringify(sent).toLowerCase();
  const pick = CAUSES.find(([, word]) => !held.includes(word));
  const first = /^.*?[.?](?=\s|$)/.exec(text);
  if (!pick || !first) return null;
  return `${first[0].slice(0, -1)} ${pick[0]}${first[0].slice(-1)}${text.slice(first[0].length)}`;
}

export function wrongVersions(c: Extract<EvalCase, { kind: "tips" }>, kind: string, text: string): { how: "direction" | "cause"; text: string }[] {
  const candidates = [
    { how: "direction" as const, text: flipDirection(text) },
    { how: "cause" as const, text: addCause(text, c.findings) },
  ];
  return candidates.flatMap((w) => (w.text && w.text !== text && CODE.tips(c, kind, w.text) === "ok" ? [{ how: w.how, text: w.text }] : []));
}

// What a run reports.
export type Row = {
  label: string;
  outputs: number;
  codePass: number | null;
  ruleViolations: number;
  grounded: number | null;
  useful: number | null;
  plain: number | null;
  jevReal: number;
  jevFalseBlocks: number;
  jevWrong: number;
  jevCaught: number;
};

const share = (n: number, of: number) => (of === 0 ? null : n / of);
const mean = (xs: number[]) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);

export function summarize(label: string, outputs: Output[], blockFrom: number): Row {
  const judged = outputs.flatMap((o) => (o.judge ? [o.judge] : []));
  const real = outputs.flatMap((o) => (o.jev === null ? [] : [o.jev]));
  const wrong = outputs.flatMap((o) => o.wrong.flatMap((w) => (w.p === null ? [] : [w.p])));
  return {
    label,
    outputs: outputs.length,
    codePass: share(outputs.filter((o) => o.code === "ok").length, outputs.length),
    ruleViolations: outputs.reduce((n, o) => n + o.rules.length, 0),
    grounded: share(judged.filter((j) => j.grounded).length, judged.length),
    useful: mean(judged.map((j) => j.useful)),
    plain: mean(judged.map((j) => j.plain)),
    jevReal: real.length,
    jevFalseBlocks: real.filter((p) => p >= blockFrom).length,
    jevWrong: wrong.length,
    jevCaught: wrong.filter((p) => p >= blockFrom).length,
  };
}

// Rows per scope, then one for all tips and one overall, in the order shown.
export function summaries(outputs: Output[], blockFrom: number): Row[] {
  const scopes = [...new Set(outputs.map((o) => o.scope))];
  const tips = outputs.filter((o) => o.scope !== "drive");
  return [
    ...scopes.map((s) => summarize(s, outputs.filter((o) => o.scope === s), blockFrom)),
    ...(scopes.filter((s) => s !== "drive").length > 1 ? [summarize("all tips", tips, blockFrom)] : []),
  ];
}

const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);
const num = (x: number | null) => (x === null ? "—" : x.toFixed(2));

// The headline numbers of a row as a name, a value to show and a value to compare.
export function headlines(r: Row): [name: string, shown: string, value: number | null][] {
  return [
    ["app checks", pct(r.codePass), r.codePass],
    ["rule violations", String(r.ruleViolations), r.ruleViolations],
    ["grounded", pct(r.grounded), r.grounded],
    ["useful", num(r.useful), r.useful],
    ["plain", num(r.plain), r.plain],
    ["Jev false blocks", pct(share(r.jevFalseBlocks, r.jevReal)), share(r.jevFalseBlocks, r.jevReal)],
    ["Jev catch rate", pct(share(r.jevCaught, r.jevWrong)), share(r.jevCaught, r.jevWrong)],
  ];
}

// How each headline number moved against an earlier run, one line per number that moved.
export function changes(before: Row[], now: Row[]): string[] {
  return now.flatMap((r) => {
    const old = before.find((b) => b.label === r.label);
    if (!old) return [];
    const was = headlines(old);
    return headlines(r).flatMap(([name, shown, value], k) => (value === was[k][2] || value === null || was[k][2] === null ? [] : [`${r.label} ${name}: ${was[k][1]} to ${shown}`]));
  });
}

// How bad an output is, for the worst-first list: a line the app drops, or one the judge faults.
export function badness(o: Output): number {
  if (o.code !== "ok") return 6 + o.rules.length;
  if (!o.judge) return o.rules.length;
  return (o.judge.grounded ? 0 : 5) + (3 - o.judge.useful) + (3 - o.judge.plain) + o.rules.length;
}

export const reasonOf = (o: Output): string => (o.code !== "ok" ? `the app drops it (${o.code})` : (o.judge?.why ?? o.rules.join("; ")));

export { pct, num };
