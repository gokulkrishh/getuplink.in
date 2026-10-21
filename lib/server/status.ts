import "server-only";
import { cacheLife } from "next/cache";
import { DEMO } from "@/lib/demo";
import { demoData } from "./demo";
import { db } from "./supabase";
import { COMPONENTS, recordHealth, type ComponentName } from "./stream-health";
import { dailyBars, isStatus, uptimePercent, type DayBar, type DailyRow, type Status } from "@/lib/status";

const WINDOW_DAYS = 90;
const RECORD_EVERY_MS = 5 * 60_000;

export type ComponentStatus = { name: ComponentName; current: Status | null; bars: DayBar[]; uptime: number | null };
export type StatusPage = { components: ComponentStatus[]; checkedAt: string | null };

// Reads only stored rows, so the page renders fast. Writing happens elsewhere (recordIfStale), never in
// a cached function: that would also run while prerendering at build time.
export async function loadStatus(): Promise<StatusPage> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  if (DEMO) {
    const { healthDaily, healthLatest } = demoData();
    return buildStatus(healthDaily, healthLatest, Date.now());
  }
  try {
    return await readStatus();
  } catch (err) {
    // Before the migration is applied, or when the database is down: show "not checked yet" and don't
    // keep this answer (a short lifetime also keeps it out of the prerendered shell).
    console.warn("Reading health checks failed:", err);
    cacheLife("seconds");
    return { components: COMPONENTS.map((name) => ({ name, current: null, bars: dailyBars([], Date.now(), WINDOW_DAYS), uptime: null })), checkedAt: null };
  }
}

async function readStatus(): Promise<StatusPage> {
  const now = Date.now();
  const since = new Date(now - (WINDOW_DAYS + 1) * 86_400_000).toISOString();
  const [daily, latest] = await Promise.all([
    db().rpc("health_daily", { since }),
    db().from("health_checks").select("component, status, checked_at").order("checked_at", { ascending: false }).limit(40),
  ]);
  if (daily.error) throw new Error(daily.error.message);
  if (latest.error) throw new Error(latest.error.message);
  return buildStatus(daily.data as DailyCheck[], latest.data as LatestCheck[], now);
}

type DailyCheck = { component: string; day: string; status: string; up: number; total: number };
type LatestCheck = { component: string; status: string; checked_at: string };

// The page from the daily summaries and the newest checks (newest first).
function buildStatus(daily: DailyCheck[], latest: LatestCheck[], now: number): StatusPage {
  const rows = new Map<string, DailyRow[]>();
  for (const r of daily) {
    if (!isStatus(r.status)) continue;
    const list = rows.get(r.component) ?? [];
    list.push({ day: r.day, status: r.status, up: Number(r.up), total: Number(r.total) });
    rows.set(r.component, list);
  }
  const current = new Map<string, Status>();
  for (const r of latest) {
    if (!current.has(r.component) && isStatus(r.status)) current.set(r.component, r.status);
  }

  return {
    components: COMPONENTS.map((name) => {
      const list = rows.get(name) ?? [];
      const bars = dailyBars(list, now, WINDOW_DAYS);
      const shown = new Set(bars.map((b) => b.day));
      return { name, current: current.get(name) ?? null, bars, uptime: uptimePercent(list, shown) };
    }),
    checkedAt: latest[0]?.checked_at ?? null,
  };
}

// Records a check unless one landed in the last 5 minutes. Visitors, the cron and the bot all feed the
// same history, so the page never checks more than about that often. Warn-only.
export async function recordIfStale(): Promise<void> {
  if (DEMO) return;
  try {
    const { data, error } = await db().from("health_checks").select("checked_at").order("checked_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    const last = data?.checked_at ? Date.parse(data.checked_at as string) : 0;
    if (Date.now() - last < RECORD_EVERY_MS) return;
    await recordHealth();
  } catch (err) {
    console.warn("Recording health failed:", err);
  }
}
