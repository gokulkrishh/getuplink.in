import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { STATS_VERSION } from "@/lib/owners";
import { MAX_DISMISSALS, SHOW_FOR_MS } from "@/lib/share-nudge";
import { FakeDb } from "./fake-db";

// The share card's nightly decision and its reads (lib/server/share-nudge.ts): who Jev is asked about, what
// Jev sees, and that every failure means no card.

let fake: FakeDb;
mock.module("server-only", () => ({}));
mock.module("@/lib/server/supabase", () => ({ db: () => fake.client() }));

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-29T03:45:00+05:30");
const iso = (t: number) => new Date(t).toISOString();

// Each car's readings, stood in for: data since 20 days ago and a few drives.
mock.module("@/lib/server/dashboard", () => ({
  loadOwnerCars: async () => ({ kind: "ready", vehicles: [{ id: "1", vin: "5YJ3E1EA7KF000001", display_name: "Jev's Car" }], lastRun: null }),
}));
mock.module("@/lib/server/driving", () => ({
  loadDrivingFigures: async () => ({ since: NOW - 20 * DAY, odometerKm: 1234, periods: {} }),
  loadRecentDrives: async () => [1, 2, 9, 12, 15].map((d) => ({ start: NOW - d * DAY, end: NOW - d * DAY + 3_600_000, km: 25, kwh: 4, whPerKm: 160 })),
}));

const { runShareNudges, shareNudgeCheck, dismissShareNudge } = await import("@/lib/server/share-nudge");
const { asOwner } = await import("@/lib/server/data/owner");
const { setSharing } = await import("@/lib/server/owners");

const user = (id: number, patch: Record<string, unknown> = {}) => ({
  id,
  tesla_sub: `tesla-${id}`,
  status: "approved",
  share_with_owners: false,
  share_nudge_dismissals: 0,
  share_nudge_dismissed_at: null,
  share_nudge_show_from: null,
  share_nudge_show_until: null,
  share_stopped_at: null,
  ...patch,
});
const READY = { computed_at: iso(NOW - 60_000), cars: 8, stats: { v: STATS_VERSION, cars: 8, owners: 6, metrics: {} } };

const realFetch = globalThis.fetch;
let bodies: { state: { figures: Record<string, unknown> } }[] = [];
function stubJev(answer: (n: number) => number | Error | "500") {
  bodies = [];
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    const a = answer(bodies.length);
    if (a instanceof Error) throw a;
    if (a === "500") return new Response("down", { status: 500 });
    return new Response(JSON.stringify({ answers: { interesting: { type: "noul", noul: a } } }), { headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = "test-key";
  delete process.env.JEV_OFF;
  fake = new FakeDb({
    users: [
      user(1),
      user(2, { share_with_owners: true }),
      user(3, { share_nudge_dismissals: MAX_DISMISSALS, share_nudge_dismissed_at: iso(NOW - 400 * DAY) }),
      // Said Not now 10 days ago, with a window left from before: cleared, not asked.
      user(4, { share_nudge_dismissals: 1, share_nudge_dismissed_at: iso(NOW - 10 * DAY), share_nudge_show_from: iso(NOW - 11 * DAY), share_nudge_show_until: iso(NOW + DAY) }),
    ],
    fleet_stats: [READY],
  });
});
afterEach(() => {
  globalThis.fetch = realFetch;
});
afterAll(() => {
  delete process.env.OPENROUTER_API_KEY;
});

const row = (id: number) => fake.rows("users").find((u) => u.id === id)!;

describe("the nightly decision", () => {
  test("asks Jev only about owners the rules allow, and a yes opens a window until the next night", async () => {
    stubJev(() => 0.8);
    const run = await runShareNudges(NOW + 60_000, () => NOW);
    expect(run).toMatchObject({ asked: 1, yes: 1, cleared: 1, failed: 0 });
    expect(row(1).share_nudge_show_from).toBe(iso(NOW));
    expect(row(1).share_nudge_show_until).toBe(iso(NOW + SHOW_FOR_MS));
    expect(row(2).share_nudge_show_until).toBeNull();
    expect(row(3).share_nudge_show_until).toBeNull();
    expect(row(4).share_nudge_show_until).toBeNull();
  });

  test("Jev sees numbers only: no VIN, car name or place", async () => {
    stubJev(() => 0.8);
    await runShareNudges(NOW + 60_000, () => NOW);
    expect(bodies).toHaveLength(1);
    const sent = JSON.stringify(bodies[0].state);
    expect(sent).not.toContain("5YJ3E1EA7KF000001");
    expect(sent).not.toContain("Jev's Car");
    expect(Object.values(bodies[0].state.figures).every((v) => v === null || typeof v === "number")).toBe(true);
    expect(bodies[0].state.figures).toMatchObject({ daysOfData: 20, kmThisWeek: 50, drivesThisWeek: 2 });
  });

  test("a no, an error or no answer opens no window (fail closed), and clears yesterday's", async () => {
    for (const answer of [0.2, new Error("network"), "500" as const]) {
      fake.rows("users")[0].share_nudge_show_from = iso(NOW - DAY);
      fake.rows("users")[0].share_nudge_show_until = iso(NOW + 2 * 3_600_000);
      stubJev(() => answer);
      const run = await runShareNudges(NOW + 60_000, () => NOW);
      expect(run.yes).toBe(0);
      expect(row(1).share_nudge_show_until).toBeNull();
    }
  });

  test("off without the key or with JEV_OFF: nobody is asked", async () => {
    stubJev(() => 0.9);
    process.env.JEV_OFF = "1";
    expect((await runShareNudges(NOW + 60_000, () => NOW)).skipped).toBe("jev off");
    delete process.env.JEV_OFF;
    delete process.env.OPENROUTER_API_KEY;
    expect((await runShareNudges(NOW + 60_000, () => NOW)).skipped).toBe("jev off");
    expect(bodies).toHaveLength(0);
  });

  test("not when the Owners page has too few cars", async () => {
    fake = new FakeDb({ users: [user(1)], fleet_stats: [{ ...READY, stats: { v: STATS_VERSION, cars: 4, owners: 4, metrics: {} } }] });
    stubJev(() => 0.9);
    expect(await runShareNudges(NOW + 60_000, () => NOW)).toMatchObject({ asked: 0 });
  });

  test("an owner reached after the deadline isn't read or asked", async () => {
    stubJev(() => 0.9);
    // The batch starts in time; by the time the eligible owner's reads would start, the deadline has passed.
    let calls = 0;
    const run = await runShareNudges(NOW + 60_000, () => (calls++ < 2 ? NOW : NOW + 120_000));
    expect(run).toMatchObject({ asked: 0 });
    expect(run.left).toBeGreaterThanOrEqual(1);
    expect(bodies).toHaveLength(0);
  });

  test("past the deadline the rest wait for the next night", async () => {
    stubJev(() => 0.9);
    const run = await runShareNudges(NOW - 1, () => NOW);
    expect(run).toMatchObject({ asked: 0, left: 3 });
  });
});

describe("home and Not now", () => {
  const owner = asOwner(1, "tesla-1");
  const open = () => Object.assign(row(1), { share_nudge_show_from: iso(NOW - 3_600_000), share_nudge_show_until: iso(NOW + 3_600_000) });

  test("shows inside Jev's window, and Not now hides it and counts", async () => {
    open();
    expect((await shareNudgeCheck(owner))(NOW - 20 * DAY, NOW)).toBe(true);
    expect((await shareNudgeCheck(owner))(NOW - 3 * DAY, NOW)).toBe(false);
    await dismissShareNudge(owner, NOW);
    expect(row(1)).toMatchObject({ share_nudge_dismissals: 1, share_nudge_dismissed_at: iso(NOW), share_nudge_show_until: null });
    expect((await shareNudgeCheck(owner))(NOW - 20 * DAY, NOW)).toBe(false);
  });

  test("before the migration: no card, quietly", async () => {
    open();
    fake.missing.add("users");
    expect((await shareNudgeCheck(owner))(NOW - 20 * DAY, NOW)).toBe(false);
  });
});

describe("turning sharing on and off", () => {
  const owner = asOwner(1, "tesla-1");

  test("on clears any window, so a quick off can't bring the card back", async () => {
    Object.assign(row(1), { share_nudge_show_from: iso(NOW - 3_600_000), share_nudge_show_until: iso(NOW + 3_600_000) });
    await setSharing(owner, true, NOW);
    expect(row(1)).toMatchObject({ share_with_owners: true, share_nudge_show_from: null, share_nudge_show_until: null });
  });

  test("off is recorded, and that owner is never asked again", async () => {
    fake.rows("users")[0].share_with_owners = true;
    await setSharing(owner, false, NOW);
    expect(row(1)).toMatchObject({ share_with_owners: false, share_stopped_at: iso(NOW), share_nudge_show_until: null });
    stubJev(() => 0.95);
    const run = await runShareNudges(NOW + DAY + 60_000, () => NOW + DAY);
    expect(row(1).share_nudge_show_until).toBeNull();
    expect(run.asked).toBe(0);
  });

  // The share card's update fails, the sharing switch's doesn't.
  function failStopWrite(code?: string) {
    const client = fake.client.bind(fake);
    fake.client = () => {
      const c = client();
      const from = c.from.bind(c);
      c.from = ((table: string) => {
        const q = from(table);
        const update = q.update.bind(q);
        q.update = ((patch: Record<string, unknown>) =>
          "share_nudge_show_until" in patch ? { eq: async () => ({ data: null, error: { message: "boom", code } }) } : update(patch)) as typeof q.update;
        return q;
      }) as typeof c.from;
      return c;
    };
  }

  test("off fails, so the owner can try again, when the stop can't be kept", async () => {
    fake.rows("users")[0].share_with_owners = true;
    failStopWrite();
    await expect(setSharing(owner, false, NOW)).rejects.toThrow();
  });

  test("on still works when the window can't be cleared, and off works before the migration", async () => {
    failStopWrite();
    await setSharing(owner, true, NOW);
    expect(row(1).share_with_owners).toBe(true);
    failStopWrite("42703");
    await setSharing(owner, false, NOW);
    expect(row(1).share_with_owners).toBe(false);
  });
});
