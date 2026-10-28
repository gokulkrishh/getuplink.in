import { describe, expect, test } from "bun:test";
import { CASES, type EvalCase } from "@/evals/cases";
import { addCause, badness, changes, codeCheck, flipDirection, type Output, rulesCheck, summarize, summaries, summaryIn, tipsIn, wrongVersions } from "@/evals/checks";
import { parseJudge } from "@/evals/judge";
import { copyViolations } from "@/lib/copy-rules";

const tipCase = CASES.find((c): c is Extract<EvalCase, { kind: "tips" }> => c.id === "week-all-nmc")!;
const output = (over: Partial<Output> = {}): Output => ({ caseId: "x", scope: "week", findingKind: "energyUse", text: "t", code: "ok", rules: [], judge: null, jev: null, wrong: [], ...over });
const judged = (grounded: boolean, useful: number, plain: number) => ({ grounded, useful, plain, why: "w" });

describe("the cases", () => {
  test("every tips case has findings and every drive case has facts", () => {
    for (const c of CASES) expect(c.kind === "tips" ? c.findings.length : c.facts.charts.length).toBeGreaterThan(0);
  });

  test("ids are unique and hold no real identifiers", () => {
    expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
    expect(JSON.stringify(CASES)).not.toMatch(/5YJ|"lat"|"lng"/);
  });
});

describe("reading a reply", () => {
  test("keeps tips the app's checks would drop, and skips malformed ones", () => {
    expect(tipsIn(JSON.stringify({ tips: [{ kind: "a", text: " One. " }, { kind: "b" }, { kind: "c", text: "" }] }))).toEqual([{ kind: "a", text: "One." }]);
    expect(tipsIn("not json")).toEqual([]);
  });

  test("the drive summary is null when the model wrote none", () => {
    expect(summaryIn('{"summary":null}')).toBeNull();
    expect(summaryIn('{"summary":" A climb. "}')).toBe("A climb.");
  });
});

describe("grading", () => {
  test("the app's checker passes a clean tip and names why it drops a bad one", () => {
    const kind = tipCase.findings[0].kind;
    expect(codeCheck(tipCase, kind, "Short and plain.")).toBe("ok");
    expect(codeCheck(tipCase, kind, "Great news!")).toBe("style");
    expect(codeCheck(tipCase, "nothing", "Short and plain.")).toBe("kind");
    expect(codeCheck(tipCase, kind, "You charged 99 times.")).toBe("number");
  });

  test("copy rules catch jargon, dashes and filler", () => {
    expect(rulesCheck("Your telemetry median rose.")).toHaveLength(1);
    expect(copyViolations("Charge to 58% – then stop, just once!")).toHaveLength(3);
    expect(copyViolations("Your car used 150 Wh/km this week, against 128 Wh/km before.")).toEqual([]);
  });

  test("the judge reply must be whole", () => {
    expect(parseJudge('{"grounded":true,"useful":3,"plain":2,"why":"ok"}')).toEqual({ grounded: true, useful: 3, plain: 2, why: "ok" });
    expect(parseJudge('{"grounded":true,"useful":4,"plain":2,"why":"ok"}')).toBeNull();
    expect(parseJudge("{")).toBeNull();
  });
});

describe("wrong versions of a tip", () => {
  test("a direction word is flipped, keeping its capital", () => {
    expect(flipDirection("Your car used more energy than usual.")).toBe("Your car used less energy than usual.");
    expect(flipDirection("Above 80% it slows.")).toBe("Below 80% it slows.");
    expect(flipDirection("Nothing to flip here.")).toBeNull();
  });

  test("a cause is added to the first sentence, and none when a finding already mentions it", () => {
    expect(addCause("It used 10 kWh. Park in shade.", tipCase.findings)).toBe("It used 10 kWh because of heavy traffic. Park in shade.");
    expect(addCause("It used 10 kWh.", [{ ...tipCase.findings[0], facts: { note: "heavy traffic, rain, plugged in" } }])).toBeNull();
  });

  test("only versions the app's checker accepts are kept", () => {
    const kind = tipCase.findings[0].kind;
    const wrong = wrongVersions(tipCase, kind, "Your car used more energy than usual.");
    expect(wrong.map((w) => w.how)).toEqual(["direction", "cause"]);
    for (const w of wrong) expect(codeCheck(tipCase, kind, w.text)).toBe("ok");
    expect(wrongVersions(tipCase, kind, "No direction here at all.").map((w) => w.how)).toEqual(["cause"]);
  });
});

describe("a run's numbers", () => {
  const outputs = [
    output({ judge: judged(true, 3, 3), jev: 0.1, wrong: [{ how: "cause", text: "a", p: 0.95 }, { how: "direction", text: "b", p: 0.3 }] }),
    output({ judge: judged(false, 1, 2), rules: ["no filler words"], jev: 0.97 }),
    output({ code: "number" }),
    output({ scope: "drive", judge: judged(true, 2, 2) }),
  ];

  test("a row counts passes, rule hits, judge averages and Jev's blocks over the lines that have them", () => {
    const row = summarize("week", outputs.slice(0, 3), 0.9);
    expect(row).toMatchObject({ outputs: 3, ruleViolations: 1, jevReal: 2, jevFalseBlocks: 1, jevWrong: 2, jevCaught: 1 });
    expect(row.codePass).toBeCloseTo(2 / 3);
    expect(row.grounded).toBe(0.5);
    expect(row.useful).toBe(2);
    expect(row.plain).toBe(2.5);
  });

  test("a row with nothing judged reports none rather than zero", () => {
    expect(summarize("week", [output({ code: "style" })], 0.9)).toMatchObject({ codePass: 0, grounded: null, useful: null });
  });

  test("rows come per surface, with one for all tips when there are several", () => {
    expect(summaries(outputs, 0.9).map((r) => r.label)).toEqual(["week", "drive"]);
    expect(summaries([...outputs, output({ scope: "battery" })], 0.9).map((r) => r.label)).toEqual(["week", "drive", "battery", "all tips"]);
  });

  test("change against an earlier run lists only the numbers that moved", () => {
    const before = summaries(outputs, 0.9);
    const now = summaries([outputs[0], outputs[1], output({ code: "ok", judge: judged(true, 3, 3) }), outputs[3]], 0.9);
    expect(changes(before, now)).toEqual(["week app checks: 67% to 100%", "week grounded: 50% to 67%", "week useful: 2.00 to 2.33", "week plain: 2.50 to 2.67"]);
    expect(changes(before, before)).toEqual([]);
  });

  test("a line that is shown and wrong is worse than one the app drops", () => {
    expect(badness(outputs[1])).toBeGreaterThan(badness(outputs[2]));
    expect(badness(outputs[2])).toBeGreaterThan(badness(outputs[0]));
  });
});
