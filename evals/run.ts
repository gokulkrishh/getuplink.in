// Measures the quality of Uplink's three AI outputs (tips, drive wording, Jev's tip checks) so a prompt or
// model change can be compared with the run before it. Calls OpenRouter, so it costs a few cents.
//
//   bun run eval [--only tips|drive|jev] [--case <id>] [--repeat <n>] [--max-usd <n>]
//
// Each case is sent once per repeat, the way the app sends it (one call, no retry), so "app checks" is the
// first-try pass rate. Results are saved to evals/runs/<time>.json; the numbers print beside the latest earlier run.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WORDING_MODEL } from "@/lib/drive-wording";
import { writeWording } from "@/lib/server/drive-wording";
import { writeTips } from "@/lib/server/ai-tips";
import { BLOCK_FROM, checkTip, JEV_MODEL, jevOn } from "@/lib/server/jev";
import { CASES, type EvalCase, SURFACES } from "./cases";
import { badness, changes, codeCheck, headlines, type Output, reasonOf, rulesCheck, type Row, summaries, summaryIn, tipsIn, wrongVersions } from "./checks";
import { JUDGE_MODEL, judge } from "./judge";

const AT_ONCE = 6;
const RUNS = join(import.meta.dir, "runs");
// What one call of each kind is assumed to cost before it is measured, to stop before a call would pass --max-usd.
const ESTIMATE = { generate: 0.002, judge: 0.02, jev: 0.001 };

function flag(name: string): string | undefined {
  const k = process.argv.indexOf(`--${name}`);
  return k === -1 ? undefined : process.argv[k + 1];
}
const only = flag("only");
if (only && !["tips", "drive", "jev"].includes(only)) throw new Error("--only is tips, drive or jev.");
const caseId = flag("case");
const repeat = Math.max(1, Number(flag("repeat") ?? 1) || 1);
const maxUsd = Number(flag("max-usd") ?? 1);
const key = process.env.OPENROUTER_API_KEY?.trim();
if (!key) throw new Error("Needs OPENROUTER_API_KEY (run with --env-file=.env.local).");

const spent = { generate: 0, judge: 0, jev: 0 };
const total = () => spent.generate + spent.judge + spent.jev;
// Reserves room for a call of this kind; false when it could pass the cap, so the call is skipped.
const room = (kind: keyof typeof ESTIMATE) => total() + ESTIMATE[kind] <= maxUsd;
let skipped = 0;
const problems: string[] = [];

async function pool<T>(items: T[], run: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, items.length) }, async () => {
    while (next < items.length) await run(items[next++]);
  }));
}

const cases = CASES.filter((c) => (only === "drive" ? c.kind === "drive" : only === "tips" || only === "jev" ? c.kind === "tips" : true)).filter((c) => !caseId || c.id === caseId);
if (cases.length === 0) throw new Error("No case matches.");

const outputs: Output[] = [];

async function generate(c: EvalCase): Promise<void> {
  if (!room("generate")) return void skipped++;
  const reply = c.kind === "tips" ? await writeTips(SURFACES[c.scope], c.findings, c.car, key) : await writeWording(c.facts, key);
  if (!reply.ok) return void problems.push(`${c.id}: ${reply.error}`);
  spent.generate += reply.costUsd ?? 0;
  const lines = c.kind === "tips" ? tipsIn(reply.reply) : [{ kind: null, text: summaryIn(reply.reply) }].filter((l): l is { kind: null; text: string } => l.text !== null);
  for (const l of lines) outputs.push({ caseId: c.id, scope: c.kind === "tips" ? c.scope : "drive", findingKind: l.kind, text: l.text, code: codeCheck(c, l.kind, l.text), rules: rulesCheck(l.text), judge: null, jev: null, wrong: [] });
}

async function grade(o: Output): Promise<void> {
  const c = CASES.find((x) => x.id === o.caseId)!;
  if (o.code !== "ok") return;
  if (only !== "jev") {
    if (!room("judge")) skipped++;
    else {
      const subject = c.kind === "tips" ? { kind: "tips" as const, finding: c.findings.find((f) => f.kind === o.findingKind)!, car: c.car, text: o.text } : { kind: "drive" as const, facts: c.facts, text: o.text };
      const graded = await judge(subject, key!);
      if (graded.ok) {
        o.judge = graded.judge;
        spent.judge += graded.costUsd;
      } else problems.push(`judge ${o.caseId}: ${graded.error}`);
    }
  }
  if (c.kind === "tips" && (only === undefined || only === "jev") && jevOn()) {
    if (!room("jev")) return void skipped++;
    const real = await checkTip({ findings: c.findings, tip: o.text });
    o.jev = real?.p ?? null;
    spent.jev += real?.cost ?? 0;
    for (const w of wrongVersions(c, o.findingKind!, o.text)) {
      const v = room("jev") ? await checkTip({ findings: c.findings, tip: w.text }) : (skipped++, null);
      o.wrong.push({ ...w, p: v?.p ?? null });
      spent.jev += v?.cost ?? 0;
    }
  }
}

const jobs = cases.flatMap((c) => Array.from({ length: repeat }, () => c));
await pool(jobs, generate);
await pool(outputs, grade);

const rows = summaries(outputs, BLOCK_FROM);
const pad = (v: string, n: number) => v.padEnd(n);
const cell = (v: string, n: number) => v.padStart(n);
const fraction = (n: number, of: number) => (of === 0 ? "—" : `${n} of ${of}`);

console.log(`\nEval: tips and drive wording by ${WORDING_MODEL}, judged by ${JUDGE_MODEL}, tips checked by ${JEV_MODEL} (blocks from p >= ${BLOCK_FROM})`);
console.log(`${jobs.length} calls, ${outputs.length} lines written, ${outputs.filter((o) => o.code === "ok").length} passed the app's checks\n`);
const head = [pad("surface", 12), cell("outputs", 8), cell("app checks", 11), cell("rule hits", 10), cell("grounded", 9), cell("useful", 7), cell("plain", 7), cell("Jev false blocks", 17), cell("Jev caught", 11)];
console.log(head.join(" "));
for (const r of rows) {
  const h = Object.fromEntries(headlines(r).map(([name, shown]) => [name, shown]));
  console.log([pad(r.label, 12), cell(String(r.outputs), 8), cell(h["app checks"], 11), cell(h["rule violations"], 10), cell(h.grounded, 9), cell(h.useful, 7), cell(h.plain, 7), cell(fraction(r.jevFalseBlocks, r.jevReal), 17), cell(fraction(r.jevCaught, r.jevWrong), 11)].join(" "));
}

const all = rows.find((r) => r.label === "all tips");
if (all && all.jevReal > 0) {
  console.log(`\nJev: blocked ${fraction(all.jevFalseBlocks, all.jevReal)} real tips that passed the app's checks. It caught ${fraction(all.jevCaught, all.jevWrong)} wrong tips (a flipped direction word or an added cause the findings don't hold).`);
  const missed = outputs.flatMap((o) => o.wrong.filter((w) => w.p !== null && w.p < BLOCK_FROM).map((w) => `  p ${w.p!.toFixed(2)} (${w.how}): ${w.text}`));
  if (missed.length > 0) console.log(`Wrong tips Jev let through:\n${missed.slice(0, 5).join("\n")}`);
}

console.log(`\nCost measured: $${total().toFixed(4)} (writing $${spent.generate.toFixed(4)}, judge $${spent.judge.toFixed(4)}, Jev $${spent.jev.toFixed(4)}), cap $${maxUsd}`);
if (skipped > 0) console.log(`Stopped short: ${skipped} calls skipped to stay under the cap.`);
if (only !== "drive" && !jevOn()) console.log("Jev was not called (it is off for this run).");
for (const p of problems.slice(0, 5)) console.log(`Problem: ${p}`);

const worst = outputs.filter((o) => badness(o) > 0).sort((a, b) => badness(b) - badness(a)).slice(0, 5);
if (worst.length > 0) {
  console.log("\nWorst outputs:");
  for (const o of worst) console.log(`- ${o.scope} · ${o.caseId}: ${o.text}\n    ${reasonOf(o)}${o.rules.length > 0 ? ` Rules: ${o.rules.join("; ")}.` : ""}`);
}

mkdirSync(RUNS, { recursive: true });
const earlier = readdirSync(RUNS).filter((f) => f.endsWith(".json")).sort().at(-1);
const now = new Date().toISOString();
writeFileSync(join(RUNS, `${now.replace(/:/g, "-")}.json`), JSON.stringify({ at: now, args: { only: only ?? null, case: caseId ?? null, repeat, maxUsd }, models: { writer: WORDING_MODEL, judge: JUDGE_MODEL, jev: JEV_MODEL }, cost: { ...spent, total: total() }, rows, outputs, problems, skipped }, null, 2));
if (earlier) {
  const prior = JSON.parse(readFileSync(join(RUNS, earlier), "utf8")) as { rows: Row[]; args?: { only: string | null; case: string | null; repeat: number } };
  const moved = changes(prior.rows, rows);
  const same = prior.args?.only === (only ?? null) && prior.args?.case === (caseId ?? null) && prior.args?.repeat === repeat;
  console.log(`\nChange since ${earlier.replace(".json", "")}${same ? "" : " (it ran with other options, so read with care)"}:${moved.length === 0 ? " none" : `\n${moved.map((m) => `- ${m}`).join("\n")}`}`);
}
