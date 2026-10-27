import { describe, expect, test } from "bun:test";
import { checkTips, DROP_AT, demoTips, type Finding, MAX_FINDINGS, modelFindings, rankWithVotes, tipProblem, tipsKey, tipsRequest, topFindings, votesNote } from "@/lib/ai-tips";
import { kindLabel, netByKind, summariseVotes, tipVoteInput } from "@/lib/tip-votes";
import { WEEK_TIPS } from "@/lib/week-wording";

const finding = (kind: string, score: number, facts: Finding["facts"], say = "A plain line."): Finding => ({ kind, score, facts, say, hint: "Steady speeds help." });

const sent: Finding[] = [
  finding("chargingCost", 2050, { thisWeek: "₹22.40/kWh", cheapest: { station: "VoltPoint, Lakeview Fuels", price: "₹16.52/kWh" }, atCheapestWouldHaveSaved: "₹84.20" }),
  finding("hardMoments", 1300, { hardBrakes: 4, usualHardMomentsPerDrive: 1, regenWonBack: "4.2 kWh", energyDrawn: "10.1 kWh" }),
];

describe("AI tips: code finds, AI words", () => {
  test("the model sees the top findings only, without scores or demo lines", () => {
    const many = Array.from({ length: 8 }, (_, k) => finding(`k${k}`, k, { n: k }));
    const top = topFindings(many);
    expect(top).toHaveLength(MAX_FINDINGS);
    expect(top[0].kind).toBe("k7");
    const body = tipsRequest(WEEK_TIPS, sent);
    const user = JSON.parse(body.messages.at(-1)!.content);
    expect(user).toEqual(modelFindings(sent));
    expect(JSON.stringify(user)).not.toContain("score");
    expect(JSON.stringify(user)).not.toContain("A plain line.");
  });

  test("a tip using only the figures sent passes", () => {
    expect(tipProblem("Ease off earlier before stops: this drive had 4 hard brakes against your usual 1, and regen won back 4.2 kWh of 10.1 kWh.", sent)).toBeNull();
    expect(tipProblem("Charging at VoltPoint, Lakeview Fuels costs ₹16.52/kWh against ₹22.40/kWh this week, ₹84.20 less.", sent)).toBeNull();
  });

  test("made-up numbers, style breaks, meta talk and banned topics don't show", () => {
    expect(tipProblem("You could save ₹90 a week.", sent)).toBe("number");
    expect(tipProblem("Brake 3 times less.", sent)).toBe("number");
    expect(tipProblem("Four hard brakes is a lot.", sent)).toBe("number");
    expect(tipProblem("Regen won back half.", sent)).toBe("number");
    expect(tipProblem("Charge cheaper!", sent)).toBe("style");
    expect(tipProblem("Charge at 80% to 90%; it helps.", sent)).toBe("style");
    expect(tipProblem("The data shows 4 hard brakes.", sent)).toBe("meta");
    expect(tipProblem("That would have saved ₹84.20 on this session.", sent)).toBe("word");
    expect(tipProblem("Your median is 4 hard brakes.", sent)).toBe("word");
    expect(tipProblem("Gentle braking keeps the battery healthy.", sent)).toBe("topic");
    expect(tipProblem("Hard brakes wear the tyres.", sent)).toBe("topic");
    expect(tipProblem("One. Two. Three.", sent)).toBe("sentences");
    expect(tipProblem("Charge cheaper", sent)).toBe("unfinished");
  });

  test("a number in a fact's name isn't a figure the tip may use", () => {
    const keyed = [finding("speed", 600, { timeAbove80: "5 min", topSpeed: "97 km/h" })];
    expect(tipProblem("You spent 5 min fast, with a top of 97 km/h.", keyed)).toBeNull();
    expect(tipProblem("Keep under 80 to save energy.", keyed)).toBe("number");
  });

  test("a page with a period switch gets no tip that names a period", () => {
    const battery = { scope: "battery" as const, version: 1, context: "", noPeriod: true };
    const tips = { tips: [{ kind: "chargingCost", text: "Charging cost ₹22.40/kWh this week." }] };
    expect(checkTips(tips, sent, battery)).toEqual([]);
    expect(checkTips(tips, sent, WEEK_TIPS)).toHaveLength(1);
  });

  test("the stored tips' key doesn't change when votes only reorder the same findings", () => {
    expect(tipsKey(WEEK_TIPS, [sent[1], sent[0]])).toBe(tipsKey(WEEK_TIPS, sent));
  });

  test("the tyres can be named only for a rotation that's due, never their wear", () => {
    const rotation = [finding("tyreRotation", 1060, { rotateAt: "10,000 km", toGo: "650 km" })];
    expect(tipProblem("Book a tyre rotation: it's due at 10,000 km, 650 km from now.", rotation)).toBeNull();
    expect(tipProblem("Rotating the tyres evens out their wear.", rotation)).toBe("topic");
  });

  test("a reply keeps at most three passing tips, and one that isn't JSON gives none", () => {
    const three = [...sent, finding("energyUse", 1100, {}), finding("speed", 600, {})];
    expect(checkTips({ tips: ["chargingCost", "hardMoments", "energyUse", "speed"].map((kind) => ({ kind, text: "A." })) }, three)).toHaveLength(3);
    expect(checkTips({ tips: [{ kind: "chargingCost", text: "You saved ₹12." }, { kind: "chargingCost", text: "Charging cost ₹22.40/kWh this week." }] }, sent)).toEqual([
      { kind: "chargingCost", text: "Charging cost ₹22.40/kWh this week." },
    ]);
    expect(checkTips("not json", sent)).toEqual([]);
  });

  test("a tip must name the kind of a finding sent, one tip a kind", () => {
    expect(checkTips({ tips: [{ kind: "madeUp", text: "Charging cost ₹22.40/kWh this week." }] }, sent)).toEqual([]);
    expect(checkTips({ tips: [{ kind: "chargingCost", text: "A." }, { kind: "chargingCost", text: "B." }] }, sent)).toEqual([{ kind: "chargingCost", text: "A." }]);
  });

  test("the owner's votes move a kind up or down, and drop it after 3 net votes against", () => {
    const list = [finding("a", 1100, {}), finding("b", 1000, {}), finding("c", 500, {})];
    expect(rankWithVotes(list, {}).map((f) => f.score)).toEqual([1100, 1000, 500]);
    const net = netByKind([{ kind: "c", vote: 1 }, { kind: "c", vote: 1 }, { kind: "a", vote: -1 }, { kind: "b", vote: -1 }, { kind: "b", vote: -1 }, { kind: "b", vote: -1 }]);
    expect(net).toEqual({ c: 2, a: -1, b: -3 });
    expect(DROP_AT).toBe(-3);
    expect(topFindings(rankWithVotes(list, net)).map((f) => f.kind)).toEqual(["c", "a"]);
  });

  test("the stored tips' key changes with the figures, not with the order of their keys", () => {
    const a = tipsKey(WEEK_TIPS, [finding("x", 1, { a: "1 km", b: "2 km" })]);
    expect(tipsKey(WEEK_TIPS, [finding("x", 1, { b: "2 km", a: "1 km" })])).toBe(a);
    expect(tipsKey(WEEK_TIPS, [finding("x", 1, { a: "1 km", b: "3 km" })])).not.toBe(a);
  });

  test("the owner's votes steer the prompt, and only when there are some", () => {
    expect(votesNote(null)).toBeNull();
    expect(votesNote({ useful: [], notUseful: [] })).toBeNull();
    const body = tipsRequest(WEEK_TIPS, sent, { useful: ["Charge at the cheaper station."], notUseful: ["Drive less."] });
    expect(body.messages).toHaveLength(3);
    expect(body.messages[1].content).toContain("Write more of this kind:\n- Charge at the cheaper station.");
    expect(body.messages[1].content).toContain("Don't write tips like these:\n- Drive less.");
  });

  test("demo mode shows each finding's own line", () => {
    expect(demoTips(sent)).toEqual([{ kind: "chargingCost", text: "A plain line." }, { kind: "hardMoments", text: "A plain line." }]);
  });

  test("a vote is checked before it's kept", () => {
    const ok = { scope: "week", entity: "1761503400000", kind: "pastEighty", tip: "Charge at 80%.", vote: 1 };
    expect(tipVoteInput.safeParse(ok).success).toBe(true);
    expect(tipVoteInput.safeParse({ ...ok, vote: 2 }).success).toBe(false);
    expect(tipVoteInput.safeParse({ ...ok, scope: "nope" }).success).toBe(false);
    expect(tipVoteInput.safeParse({ ...ok, entity: "abc" }).success).toBe(false);
    expect(tipVoteInput.safeParse({ ...ok, kind: "a b" }).success).toBe(false);
  });

  test("Admin sees each kind summed, the kinds that need work first, with a few recent tips", () => {
    const votes = [
      { scope: "week", kind: "energyUse", tip: "E1.", vote: 1 },
      { scope: "week", kind: "parkedLoss", tip: "P1.", vote: -1 },
      { scope: "week", kind: "energyUse", tip: "E2.", vote: 1 },
      { scope: "week", kind: "parkedLoss", tip: "P2.", vote: 1 },
      { scope: "week", kind: "parkedLoss", tip: "P3.", vote: -1 },
      { scope: "week", kind: "parkedLoss", tip: "P4.", vote: -1 },
    ];
    const rows = summariseVotes(votes);
    expect(rows.map((r) => r.kind)).toEqual(["parkedLoss", "energyUse"]);
    expect(rows[0]).toMatchObject({ useful: 1, notUseful: 3, share: 0.25 });
    expect(rows[0].examples.map((e) => e.tip)).toEqual(["P1.", "P2.", "P3."]);
    expect(kindLabel("pastEighty")).toBe("Past eighty");
    expect(kindLabel("cheaperNearby")).toBe("Cheaper nearby");
  });
});
