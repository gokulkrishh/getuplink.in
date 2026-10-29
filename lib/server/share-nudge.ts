import "server-only";
import { cookies } from "next/headers";
import { DEMO } from "@/lib/demo";
import { messageOf } from "@/lib/errors";
import { canAsk, MAX_DISMISSALS, USUAL_WEEKS, type NudgeFacts, nudgeFigures, showNudge, type StatsHead, verdictWindow } from "@/lib/share-nudge";
import type { Owner } from "./data/owner";
import { latestOwnerStats } from "./data/owners";
import { MissingSchema } from "./data/usage";
import { nudgeCandidates, nudgeOf, saveDismissal, saveNudgeWindow } from "./data/share-nudge";
import { loadOwnerCars } from "./dashboard";
import { loadDrivingFigures, loadRecentDrives } from "./driving";
import { askShareInterest, jevOn } from "./jev";
import { DEMO_SHARING_COOKIE } from "./owners";

// The share card on home (lib/share-nudge.ts has the rules): whether to show it, Not now, and the nightly
// decision that asks Jev. Every failure here means no card: a missing column, a read error, Jev down.

// Demo mode has no database: the card shows until Not now (for the browser session) or Share. The demo
// shares by default, so only a Share from the card or Settings ("on") hides it there.
export const DEMO_NUDGE_COOKIE = "uplink-demo-share-nudge";

const statsHead = (row: Awaited<ReturnType<typeof latestOwnerStats>>): StatsHead | null => {
  const s = row?.stats as { v?: unknown; cars?: unknown; owners?: unknown } | undefined;
  return s && typeof s.v === "number" && typeof s.cars === "number" && typeof s.owners === "number" ? { v: s.v, cars: s.cars, owners: s.owners } : null;
};

// Whether home shows the card, as a check on the primary car's data start (home's figures.since): the owner's
// row and the totals are read while home loads, so the card renders with the tiles. Any failure: no card.
export async function shareNudgeCheck(owner: Owner): Promise<(dataSince: number | null, now: number) => boolean> {
  if (DEMO) {
    const jar = await cookies();
    const shown = !jar.get(DEMO_NUDGE_COOKIE) && jar.get(DEMO_SHARING_COOKIE)?.value !== "on";
    return () => shown;
  }
  try {
    const [row, stats] = await Promise.all([nudgeOf(owner), latestOwnerStats()]);
    if (!row) return () => false;
    const head = statsHead(stats);
    return (dataSince, now) => showNudge({ ...row, dataSince, stats: head }, now);
  } catch (err) {
    if (!(err instanceof MissingSchema)) console.warn("Share card skipped:", messageOf(err));
    return () => false;
  }
}

// Not now. Before the migration, nothing to store, and the card wasn't shown anyway.
export async function dismissShareNudge(owner: Owner, now: number): Promise<void> {
  if (DEMO) {
    // No maxAge: gone for this browser session.
    (await cookies()).set(DEMO_NUDGE_COOKIE, "1", { path: "/", httpOnly: true, sameSite: "lax" });
    return;
  }
  const row = await nudgeOf(owner);
  if (!row) return;
  await saveDismissal(owner, Math.min(row.dismissals + 1, MAX_DISMISSALS), new Date(now).toISOString());
}

// ---- The nightly decision, after the owners run (app/api/cron/owners) ----

export type NudgeRun = { asked: number; yes: number; cleared: number; left: number; failed: number; skipped?: string };

// Several owners at once, so a slow Jev doesn't use up the run.
const BATCH = 5;

// This week and the usual weeks before it, plus a day.
const DRIVE_DAYS = (USUAL_WEEKS + 1) * 7 + 1;

async function decide(c: Awaited<ReturnType<typeof nudgeCandidates>>[number], stats: StatsHead | null, now: number, run: NudgeRun, late: () => boolean): Promise<void> {
  const facts = (dataSince: number | null): NudgeFacts => ({ ...c, dataSince, stats });
  // The rules that need no readings first, so an owner who can't be asked costs no reads.
  if (!canAsk(facts(0), now)) {
    if (c.showUntil !== null) {
      await saveNudgeWindow(c.owner, null);
      run.cleared++;
    }
    return;
  }
  // The reads are the slow part: an owner reached after the deadline waits for the next night.
  if (late()) {
    run.left++;
    return;
  }
  const cars = await loadOwnerCars(c.owner);
  const vin = cars.kind === "ready" ? (cars.vehicles.find((v) => v.vin)?.vin ?? null) : null;
  const [figures, drives] = vin ? await Promise.all([loadDrivingFigures(c.owner, vin, now), loadRecentDrives(c.owner, vin, now, DRIVE_DAYS)]) : [null, []];
  const since = figures?.since ?? null;
  if (since === null || !canAsk(facts(since), now)) {
    if (c.showUntil !== null) {
      await saveNudgeWindow(c.owner, null);
      run.cleared++;
    }
    return;
  }
  run.asked++;
  const p = await askShareInterest(nudgeFigures(drives, since, now));
  const open = verdictWindow(p, now);
  if (open) run.yes++;
  await saveNudgeWindow(c.owner, open && { from: new Date(open.from).toISOString(), until: new Date(open.until).toISOString() });
}

// Asks Jev about each owner who may be asked, until `deadline`; the rest get no card until the next night.
// Off in demo, without OPENROUTER_API_KEY or with JEV_OFF: then nobody is asked and no new window opens.
export async function runShareNudges(deadline: number, clock: () => number = Date.now): Promise<NudgeRun> {
  const run: NudgeRun = { asked: 0, yes: 0, cleared: 0, left: 0, failed: 0 };
  if (DEMO) return { ...run, skipped: "demo" };
  if (!jevOn()) return { ...run, skipped: "jev off" };
  let candidates: Awaited<ReturnType<typeof nudgeCandidates>>;
  let stats: StatsHead | null;
  try {
    [candidates, stats] = await Promise.all([nudgeCandidates(), latestOwnerStats().then(statsHead)]);
  } catch (err) {
    return { ...run, skipped: messageOf(err) };
  }
  for (let k = 0; k < candidates.length; k += BATCH) {
    if (clock() > deadline) {
      run.left += candidates.length - k;
      break;
    }
    const now = clock();
    await Promise.all(
      candidates.slice(k, k + BATCH).map((c) =>
        decide(c, stats, now, run, () => clock() > deadline).catch((err) => {
          run.failed++;
          console.warn("Share card decision failed:", messageOf(err));
        }),
      ),
    );
  }
  return run;
}
