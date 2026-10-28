import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { Finding } from "@/lib/ai-tips";
import { summariseJev } from "@/lib/jev-checks";
import { WEEK_TIPS } from "@/lib/week-wording";
import { FakeDb } from "./fake-db";

// Jev's check on each AI tip (lib/server/jev.ts), its use in generateTips and replaceTip, and Admin's summary.

let fake: FakeDb;
mock.module("server-only", () => ({}));
mock.module("@/lib/server/supabase", () => ({ db: () => fake.client() }));

const { BLOCK_FROM, checkTip, jevRequest, parseJev } = await import("@/lib/server/jev");
const { generateTips, replaceTip } = await import("@/lib/server/ai-tips");
const { asOwner } = await import("@/lib/server/data/owner");

const owner = asOwner(1, "sub-1");
const finding = (kind: string, facts: Finding["facts"]): Finding => ({ kind, score: 1000, facts, say: "A plain line.", hint: "Steady speeds help." });
const sent: Finding[] = [
  finding("chargingCost", { thisWeek: "₹22.40/kWh", cheapest: { station: "VoltPoint, Lakeview Fuels", price: "₹16.52/kWh" }, atCheapestWouldHaveSaved: "₹84.20" }),
  finding("hardMoments", { hardBrakes: 4, usualHardMomentsPerDrive: 1, regenWonBack: "4.2 kWh", energyDrawn: "10.1 kWh" }),
];
const CHARGE_TIP = "Charging at VoltPoint, Lakeview Fuels costs ₹16.52/kWh against ₹22.40/kWh this week, ₹84.20 less.";
const BRAKE_TIP = "Ease off earlier before stops: this drive had 4 hard brakes against your usual 1, and regen won back 4.2 kWh of 10.1 kWh.";
const decision = (p: number) => ({ id: "gen-dec-1", model: "typesafe/jev-1.14-20261014", provider: "TypeSafe", answers: { unsupported: { type: "noul", noul: p } }, usage: { input_tokens: 400, output_tokens: 20, cost: 0.00002 } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const realFetch = globalThis.fetch;
let jevBodies: Record<string, unknown>[] = [];
// The tip writer returns `tips`; Jev answers with jevP(tip text), or fails when it returns an Error.
function stubFetch(tips: { kind: string; text: string }[], jevP: (tip: string) => number | Error) {
  jevBodies = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    if (String(url).includes("/api/alpha/decisions")) {
      jevBodies.push(body);
      const p = jevP(body.state.tip);
      if (p instanceof Error) throw p;
      return json(decision(p));
    }
    return json({ choices: [{ message: { content: JSON.stringify({ tips }) } }], usage: { cost: 0.001 } });
  }) as typeof fetch;
}

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = "test-key";
  delete process.env.JEV_OFF;
  fake = new FakeDb({ drive_wording: [], tip_votes: [] });
});
afterEach(() => {
  globalThis.fetch = realFetch;
});
const env = { key: process.env.OPENROUTER_API_KEY, off: process.env.JEV_OFF };
afterAll(() => {
  for (const [name, value] of [["OPENROUTER_API_KEY", env.key], ["JEV_OFF", env.off]] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("Jev's request and answer", () => {
  test("asks one yes/no question about the tip, over the findings the writer got", () => {
    const body = jevRequest(sent, CHARGE_TIP);
    expect(body.model).toBe("~typesafe/jev-latest");
    // The station's name is the same token in the findings and the tip.
    expect(body.state.tip).toBe("Charging at [place 1] costs ₹16.52/kWh against ₹22.40/kWh this week, ₹84.20 less.");
    expect(JSON.stringify(body.state.findings)).toContain('"station":"[place 1]"');
    expect(body.questions.unsupported.type).toBe("noul");
    expect(body.provider).toEqual({ data_collection: "deny" });
  });

  test("sends no VIN, location, place or owner keys, even when a finding carries them", () => {
    const leaky = [{ ...sent[0], vin: "5YJ3E7EB0NF000001", lat: 12.97, lng: 77.59, userId: 42, vehicleId: "1492931337" } as Finding];
    const text = JSON.stringify(jevRequest(leaky, CHARGE_TIP));
    for (const leak of ["5YJ3", "12.97", "77.59", "1492931337", '"vin"', '"lat"', '"lng"', '"userId"', '"vehicleId"', '"say"', '"score"', "A plain line.", "VoltPoint", "Lakeview"]) expect(text).not.toContain(leak);
  });

  test("reads the probability of yes, and blocks from BLOCK_FROM", () => {
    expect(parseJev(decision(0.97), 0)).toEqual({ unsupported: true, p: 0.97, at: new Date(0).toISOString(), model: "typesafe/jev-1.14-20261014", cost: 0.00002 });
    expect(parseJev(decision(BLOCK_FROM))?.unsupported).toBe(true);
    expect(parseJev(decision(0.89))?.unsupported).toBe(false);
    expect(parseJev({ answers: { unsupported: { type: "choice", choice: "yes" } } })).toBeNull();
    expect(parseJev({ answers: { unsupported: { type: "noul", noul: 1.5 } } })).toBeNull();
    expect(parseJev(null)).toBeNull();
  });

  test("returns null, never throws, on an error, a timeout or a failed request", async () => {
    stubFetch([], () => new Error("boom"));
    expect(await checkTip({ findings: sent, tip: CHARGE_TIP })).toBeNull();
    stubFetch([], () => new DOMException("The operation timed out.", "TimeoutError"));
    expect(await checkTip({ findings: sent, tip: CHARGE_TIP })).toBeNull();
    globalThis.fetch = (async () => json({ error: { code: 502, message: "upstream" } }, 502)) as unknown as typeof fetch;
    expect(await checkTip({ findings: sent, tip: CHARGE_TIP })).toBeNull();
  });

  test("isn't called with JEV_OFF set or without a key", async () => {
    stubFetch([], () => 0.1);
    process.env.JEV_OFF = "1";
    expect(await checkTip({ findings: sent, tip: CHARGE_TIP })).toBeNull();
    delete process.env.JEV_OFF;
    delete process.env.OPENROUTER_API_KEY;
    expect(await checkTip({ findings: sent, tip: CHARGE_TIP })).toBeNull();
    expect(jevBodies).toHaveLength(0);
  });
});

const KEY = { vehicleId: "v1", at: Date.parse("2026-10-28T00:00:00+05:30"), daily: true };
const stored = () => fake.tables.drive_wording[0]?.wording as { tips: { kind: string; text: string; jev?: { p: number } | null }[]; jevBlocked?: { kind: string; text: string; p: number }[]; jevAt?: string };

describe("generateTips with Jev", () => {
  const both = [
    { kind: "chargingCost", text: CHARGE_TIP },
    { kind: "hardMoments", text: BRAKE_TIP },
  ];

  test("stores each tip with its verdict, drops one Jev blocks and keeps it aside", async () => {
    stubFetch(both, (tip) => (tip === BRAKE_TIP ? 0.95 : 0.12));
    await generateTips(owner, WEEK_TIPS, KEY, sent);
    const w = stored();
    expect(jevBodies).toHaveLength(2);
    expect(w.tips).toHaveLength(1);
    expect(w.tips[0]).toMatchObject({ kind: "chargingCost", text: CHARGE_TIP, jev: { unsupported: false, p: 0.12 } });
    expect(w.jevBlocked).toEqual([expect.objectContaining({ kind: "hardMoments", text: BRAKE_TIP, p: 0.95 })]);
    expect(typeof w.jevAt).toBe("string");
  });

  test("below the cut, or when Jev doesn't answer, the tip goes through", async () => {
    stubFetch(both, (tip) => (tip === BRAKE_TIP ? new Error("down") : 0.89));
    await generateTips(owner, WEEK_TIPS, KEY, sent);
    const w = stored();
    expect(w.tips.map((t) => t.kind)).toEqual(["chargingCost", "hardMoments"]);
    expect(w.tips[0].jev?.p).toBe(0.89);
    expect(w.tips[1].jev).toBeNull();
    expect(w.jevBlocked).toBeUndefined();
  });

  test("what Jev blocked before is kept when the row is written again", async () => {
    stubFetch(both, () => 0.95);
    await generateTips(owner, WEEK_TIPS, KEY, sent);
    const first = stored();
    expect(first.tips).toHaveLength(0);
    expect(first.jevBlocked).toHaveLength(2);
    await generateTips(owner, WEEK_TIPS, KEY, sent);
    expect(stored().jevBlocked).toHaveLength(4);
    expect(stored().jevAt).toBe(first.jevAt!);
  });

  test("with JEV_OFF, tips are stored unchecked, with no verdict key", async () => {
    process.env.JEV_OFF = "1";
    stubFetch(both, () => 0.99);
    await generateTips(owner, WEEK_TIPS, KEY, sent);
    expect(jevBodies).toHaveLength(0);
    expect(stored().tips).toHaveLength(2);
    expect("jev" in stored().tips[0]).toBe(false);
  });
});

describe("replaceTip with Jev", () => {
  const seed = () =>
    fake.tables.drive_wording.push({
      user_id: 1,
      vehicle_id: "v1",
      drive_start: new Date(KEY.at).toISOString(),
      scope: "week",
      cost_usd: 0,
      wording: { tips: [{ kind: "chargingCost", text: CHARGE_TIP, jev: null }], v: WEEK_TIPS.version, sent, car: null, swaps: 0 },
    });

  test("a blocked replacement counts as no tip, and the swap still counts", async () => {
    seed();
    stubFetch([{ kind: "hardMoments", text: BRAKE_TIP }], () => 0.93);
    expect(await replaceTip(owner, "week", "v1", KEY.at, "chargingCost")).toBeNull();
    const w = stored() as ReturnType<typeof stored> & { swaps: number };
    expect(w.swaps).toBe(1);
    expect(w.tips).toHaveLength(1);
    expect(w.jevBlocked?.[0]).toMatchObject({ kind: "hardMoments", p: 0.93 });
  });

  test("a passing replacement is returned without its verdict, and stored with it", async () => {
    seed();
    stubFetch([{ kind: "hardMoments", text: BRAKE_TIP }], () => 0.2);
    expect(await replaceTip(owner, "week", "v1", KEY.at, "chargingCost")).toEqual({ kind: "hardMoments", text: BRAKE_TIP });
    expect(stored().tips[1].jev?.p).toBe(0.2);
  });
});

describe("Admin's Jev summary", () => {
  const day = 86_400_000;
  const now = Date.parse("2026-10-28T12:00:00Z");
  const ago = (d: number) => new Date(now - d * day).toISOString();
  const verdict = (p: number) => ({ unsupported: p >= 0.9, p, at: ago(1), model: "m", cost: 0 });

  test("counts checked, blocked and unanswered tips, lists the blocked newest first, and compares not-useful votes", () => {
    const rows = [
      { scope: "week", created_at: ago(5), wording: { tips: [{ kind: "a", text: "Old tip, before Jev" }, { kind: "b", text: "Checked", jev: verdict(0.1) }, { kind: "c", text: "No answer", jev: null }], jevBlocked: [{ kind: "d", text: "Blocked older", p: 0.92, at: ago(5) }] } },
      { scope: "charge", created_at: ago(1), wording: { tips: [{ kind: "e", text: "Checked too", jev: verdict(0.3) }], jevBlocked: [{ kind: "f", text: "Blocked newer", p: 0.99, at: ago(1) }] } },
      { scope: "battery", created_at: ago(2), wording: null },
    ];
    const votes = [
      { vote: -1, updated_at: ago(20) },
      { vote: 1, updated_at: ago(15) },
      { vote: -1, updated_at: ago(12) },
      { vote: 1, updated_at: ago(45) }, // more than 30 days before Jev: not counted
      { vote: -1, updated_at: ago(3) },
      { vote: 1, updated_at: ago(2) },
      { vote: 1, updated_at: ago(1) },
      { vote: 1, updated_at: ago(1) },
    ];
    const s = summariseJev(rows, votes, ago(10), now);
    expect(s).toMatchObject({ checked: 5, blocked: 2, unavailable: 1, before: { votes: 3, notUseful: 2 }, since: { votes: 4, notUseful: 1 } });
    expect(s.tips.map((t) => [t.text, t.scope, t.p])).toEqual([
      ["Blocked newer", "charge", 0.99],
      ["Blocked older", "week", 0.92],
    ]);
  });

  test("before Jev's first check, no rates", () => {
    const s = summariseJev([], [{ vote: -1, updated_at: ago(1) }], null, now);
    expect(s).toMatchObject({ checked: 0, blocked: 0, before: { votes: 0 }, since: { votes: 0 }, firstAt: null });
  });
});
