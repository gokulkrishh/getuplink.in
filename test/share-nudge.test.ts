import { describe, expect, test } from "bun:test";
import { MIN_CARS, STATS_VERSION } from "@/lib/owners";
import {
  COOLDOWN_DAYS,
  canAsk,
  type Drive7,
  MAX_DISMISSALS,
  MIN_DATA_DAYS,
  type NudgeFacts,
  nudgeFigures,
  SHOW_FOR_MS,
  SHOW_FROM_P,
  promptCard,
  showNudge,
  verdictWindow,
} from "@/lib/share-nudge";

// The share card on home (lib/share-nudge.ts): the hard rules first, then Jev's daily yes on top.

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-29T10:00:00+05:30");

const base: NudgeFacts = {
  sharing: false,
  dataSince: NOW - 20 * DAY,
  stats: { v: STATS_VERSION, cars: 8, owners: 7 },
  dismissals: 0,
  dismissedAt: null,
  stoppedAt: null,
  showFrom: NOW - 2 * 3_600_000,
  showUntil: NOW + 20 * 3_600_000,
};
const facts = (patch: Partial<NudgeFacts>): NudgeFacts => ({ ...base, ...patch });

describe("the hard rules", () => {
  test("an owner not sharing, with a week of data and a full Owners page, can be asked about", () => {
    expect(canAsk(base, NOW)).toBe(true);
    expect(showNudge(base, NOW)).toBe(true);
  });

  test("never for an owner who shares, or before sharing exists", () => {
    expect(showNudge(facts({ sharing: true }), NOW)).toBe(false);
    expect(showNudge(facts({ sharing: null }), NOW)).toBe(false);
    expect(canAsk(facts({ sharing: null }), NOW)).toBe(false);
  });

  test("at least 7 days of data", () => {
    expect(MIN_DATA_DAYS).toBe(7);
    expect(showNudge(facts({ dataSince: NOW - 7 * DAY }), NOW)).toBe(true);
    expect(showNudge(facts({ dataSince: NOW - 7 * DAY + 60_000 }), NOW)).toBe(false);
    expect(showNudge(facts({ dataSince: null }), NOW)).toBe(false);
  });

  test("only when the Owners page has enough cars and owners to show anything", () => {
    expect(showNudge(facts({ stats: null }), NOW)).toBe(false);
    expect(showNudge(facts({ stats: { v: STATS_VERSION, cars: MIN_CARS - 1, owners: 7 } }), NOW)).toBe(false);
    expect(showNudge(facts({ stats: { v: STATS_VERSION, cars: 8, owners: MIN_CARS - 1 } }), NOW)).toBe(false);
    expect(showNudge(facts({ stats: { v: STATS_VERSION - 1, cars: 8, owners: 7 } }), NOW)).toBe(false);
    expect(showNudge(facts({ stats: { v: STATS_VERSION, cars: MIN_CARS, owners: MIN_CARS } }), NOW)).toBe(true);
  });

  test("30 days after Not now before it can show again", () => {
    expect(COOLDOWN_DAYS).toBe(30);
    const justUnder = facts({ dismissals: 1, dismissedAt: NOW - 30 * DAY + 60_000, showFrom: NOW - 3_600_000 });
    const after = facts({ dismissals: 1, dismissedAt: NOW - 30 * DAY, showFrom: NOW - 3_600_000 });
    expect(canAsk(justUnder, NOW)).toBe(false);
    expect(showNudge(justUnder, NOW)).toBe(false);
    expect(canAsk(after, NOW)).toBe(true);
    expect(showNudge(after, NOW)).toBe(true);
  });

  test("after 3 dismissals never again, whatever Jev says", () => {
    expect(MAX_DISMISSALS).toBe(3);
    const third = facts({ dismissals: 3, dismissedAt: NOW - 400 * DAY });
    expect(canAsk(third, NOW)).toBe(false);
    expect(showNudge(third, NOW)).toBe(false);
    expect(showNudge(facts({ dismissals: 2, dismissedAt: NOW - 40 * DAY }), NOW)).toBe(true);
  });

  test("an owner who once turned sharing off is never asked again", () => {
    const stopped = facts({ stoppedAt: NOW - 400 * DAY });
    expect(canAsk(stopped, NOW)).toBe(false);
    expect(showNudge(stopped, NOW)).toBe(false);
  });

  test("a yes from before the last Not now doesn't bring it back", () => {
    expect(showNudge(facts({ dismissals: 1, dismissedAt: NOW - 31 * DAY, showFrom: NOW - 32 * DAY, showUntil: NOW + DAY }), NOW)).toBe(false);
  });
});

describe("Jev's yes", () => {
  test("shows only inside a stored window; none, or a past one, shows nothing", () => {
    expect(showNudge(facts({ showFrom: null, showUntil: null }), NOW)).toBe(false);
    expect(showNudge(facts({ showUntil: NOW - 1 }), NOW)).toBe(false);
    expect(showNudge(facts({ showFrom: NOW + 1 }), NOW)).toBe(false);
  });

  test("a yes opens a window until the next daily decision; a no or no answer opens none", () => {
    expect(verdictWindow(SHOW_FROM_P, NOW)).toEqual({ from: NOW, until: NOW + SHOW_FOR_MS });
    expect(verdictWindow(0.99, NOW)).toEqual({ from: NOW, until: NOW + SHOW_FOR_MS });
    expect(verdictWindow(SHOW_FROM_P - 0.01, NOW)).toBeNull();
    expect(verdictWindow(null, NOW)).toBeNull();
    // About a day: the next night's decision replaces it, so an old yes never outlives a Jev outage.
    expect(SHOW_FOR_MS).toBeLessThanOrEqual(30 * 3_600_000);
  });
});

describe("the figures Jev sees", () => {
  const drive = (daysAgo: number, km: number, whPerKm: number | null): Drive7 => ({ start: NOW - daysAgo * DAY, km, whPerKm });

  test("this week against the four weeks before, numbers only", () => {
    const drives = [drive(1, 30, 150), drive(3, 20, 170), drive(10, 40, 140), drive(20, 40, 140), drive(30, 40, 140)];
    const f = nudgeFigures(drives, NOW - 35 * DAY, NOW);
    expect(f).toEqual({ daysOfData: 35, kmThisWeek: 50, drivesThisWeek: 2, usualKmPerWeek: 30, whPerKmThisWeek: 158, usualWhPerKm: 140 });
    expect(Object.values(f).every((v) => v === null || typeof v === "number")).toBe(true);
  });

  test("no usual figures without a few drives before the week", () => {
    const f = nudgeFigures([drive(1, 30, 150)], NOW - 8 * DAY, NOW);
    expect(f.usualKmPerWeek).toBeNull();
    expect(f.usualWhPerKm).toBeNull();
    expect(f.kmThisWeek).toBe(30);
  });
});

describe("one prompt card at a time", () => {
  test("a due share card wins over the Tips box: its window is one day, tips come back tomorrow", () => {
    expect(promptCard(true, true)).toBe("share");
    expect(promptCard(true, false)).toBe("share");
  });

  test("otherwise the Tips box, and nothing on a quiet week", () => {
    expect(promptCard(false, true)).toBe("tips");
    expect(promptCard(false, false)).toBeNull();
  });
});
