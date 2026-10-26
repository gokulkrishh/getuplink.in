import "server-only";
import { DEMO } from "@/lib/demo";
import { messageOf } from "@/lib/errors";
import {
  budgetLevel,
  type BudgetLevel,
  CHECK_EVERY_MS,
  CREDIT_USD,
  type Kind,
  type KindCount,
  monthStart,
  nextReset,
  parseBudget,
  priceUsage,
  type Usage,
  usageMonth,
} from "@/lib/tesla-billing";
import type { Owner } from "./data/owner";
import { countTelemetrySignals, incrementApiUsage, MissingSchema, monthUsage, signalDays, UNATTRIBUTED, vinUsers } from "./data/usage";

// Uplink's count of what it asks Tesla, and the budget it keeps to (docs/tesla-billing.md).

// ---- Streamed signals ----

// Days recounted each run: today so far, yesterday (finished since the last run) and the day before, for
// late uploads. Retention keeps nearly every field 7 days, so these rows are all still there.
export const SIGNAL_DAYS = 3;

// The retention cron, before it prunes. Never fails the cron: before the migration it reports "skipped".
export async function countSignals(): Promise<{ days: number } | { skipped: string }> {
  if (DEMO) return { skipped: "demo" };
  try {
    return { days: await countTelemetrySignals(SIGNAL_DAYS) };
  } catch (err) {
    if (err instanceof MissingSchema) return { skipped: "no signal count yet" };
    console.warn("Counting streamed signals failed:", messageOf(err));
    return { skipped: "failed" };
  }
}

// ---- Requests ----

// Counting never fails or blocks a Tesla call for long: a failure is logged once per instance. Before the
// migration (no api_usage table or function) this instance stops trying; it counts again once restarted.
let warned = false;
let schemaMissing = false;

export async function countRequest(userId: number, kind: Kind): Promise<void> {
  if (DEMO || schemaMissing) return;
  try {
    await incrementApiUsage(userId, kind);
  } catch (err) {
    if (err instanceof MissingSchema) schemaMissing = true;
    if (!warned) {
      warned = true;
      console.warn("Counting Tesla API usage failed; calls carry on uncounted:", messageOf(err));
    }
  }
}

// The user a request is counted under: the owner, or UNATTRIBUTED before there is one.
export const usageUser = (owner: Owner | null) => owner?.userId ?? UNATTRIBUTED;

export function budgetUsd(): number {
  return parseBudget(process.env.TESLA_BUDGET_USD);
}

type MonthTotals = { kinds: KindCount[]; signals: number };

export type AccountMonth = { total: MonthTotals; byUser: Map<number, MonthTotals> };

function add(map: Map<number, MonthTotals>, user: number): MonthTotals {
  let t = map.get(user);
  if (!t) map.set(user, (t = { kinds: [], signals: 0 }));
  return t;
}

const day = (d: Date) => d.toISOString().slice(0, 10);

// The developer account's month so far: every user's requests, the unattributed ones, and every VIN's
// streamed signals, each VIN's under its user. Throws MissingSchema before the migration.
export async function accountMonth(now: number): Promise<AccountMonth> {
  const [rows, signals, owners] = await Promise.all([
    monthUsage(usageMonth(now)),
    signalDays(day(monthStart(now)), day(nextReset(now))),
    vinUsers(),
  ]);
  const byUser = new Map<number, MonthTotals>();
  const total: MonthTotals = { kinds: [], signals: 0 };
  for (const r of rows) {
    add(byUser, r.user_id).kinds.push({ kind: r.kind, count: r.count });
    total.kinds.push({ kind: r.kind, count: r.count });
  }
  for (const s of signals) {
    add(byUser, owners.get(s.vin) ?? UNATTRIBUTED).signals += s.signals;
    total.signals += s.signals;
  }
  return { total, byUser };
}

export type BudgetState = {
  level: BudgetLevel;
  spentUsd: number;
  budgetUsd: number;
  // False when the usage couldn't be read: then checks run as normal.
  known: boolean;
};

export function stateFor(spentUsd: number, budget = budgetUsd()): BudgetState {
  return { level: budgetLevel(spentUsd, budget), spentUsd, budgetUsd: budget, known: true };
}

// Where the developer account stands against TESLA_BUDGET_USD this month. Never throws: an unreadable
// usage is "normal", so a missing table never stops checks.
export async function budgetState(now = Date.now()): Promise<BudgetState> {
  if (DEMO) return stateFor(demoMonth(now).total.costUsd);
  try {
    const { total } = await accountMonth(now);
    return stateFor(priceUsage(total.kinds, total.signals).costUsd);
  } catch (err) {
    if (!(err instanceof MissingSchema)) console.warn("Reading Tesla API usage failed:", messageOf(err));
    return { level: "normal", spentUsd: 0, budgetUsd: budgetUsd(), known: false };
  }
}

// How often checks run at this state, in hours; null when stopped.
export function checkEveryHours(state: Pick<BudgetState, "level">): number | null {
  return state.level === "stopped" ? null : CHECK_EVERY_MS[state.level] / 3_600_000;
}

export type UsageView = {
  month: string;
  resetsAt: string;
  creditUsd: number;
  budget: BudgetState;
  // This user's requests and signals.
  mine: Usage;
  // The developer account's, for an admin only.
  account: Usage | null;
  // False before the migration: nothing is counted yet.
  counted: boolean;
};

const empty = priceUsage([], 0);

// Settings > Tesla API usage. Everyone sees their own share; an admin also sees the account's total.
export async function loadUsage(owner: Owner, admin: boolean, now = Date.now()): Promise<UsageView> {
  const base = { month: usageMonth(now), resetsAt: nextReset(now).toISOString(), creditUsd: CREDIT_USD };
  if (DEMO) {
    const demo = demoMonth(now);
    return { ...base, budget: stateFor(demo.total.costUsd), mine: demo.mine, account: admin ? demo.total : null, counted: true };
  }
  try {
    const month = await accountMonth(now);
    const total = priceUsage(month.total.kinds, month.total.signals);
    const own = month.byUser.get(owner.userId);
    return {
      ...base,
      budget: stateFor(total.costUsd),
      mine: own ? priceUsage(own.kinds, own.signals) : empty,
      account: admin ? total : null,
      counted: true,
    };
  } catch (err) {
    if (!(err instanceof MissingSchema)) console.warn("Reading Tesla API usage failed:", messageOf(err));
    return { ...base, budget: { level: "normal", spentUsd: 0, budgetUsd: budgetUsd(), known: false }, mine: empty, account: admin ? empty : null, counted: false };
  }
}

// Admin: this month's requests per kind across the account, and its signals.
export async function accountKinds(now = Date.now()): Promise<{ kinds: KindCount[]; signals: number; usage: Usage; counted: boolean }> {
  if (DEMO) {
    const { kinds, signals, total } = demoMonth(now);
    return { kinds, signals, usage: total, counted: true };
  }
  try {
    const { total } = await accountMonth(now);
    const merged = new Map<string, number>();
    for (const k of total.kinds) merged.set(k.kind, (merged.get(k.kind) ?? 0) + k.count);
    const kinds = [...merged].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count);
    return { kinds, signals: total.signals, usage: priceUsage(total.kinds, total.signals), counted: true };
  } catch (err) {
    if (!(err instanceof MissingSchema)) console.warn("Reading Tesla API usage failed:", messageOf(err));
    return { kinds: [], signals: 0, usage: empty, counted: false };
  }
}

// ---- Demo: a simulated month for three owners with a car each ----

const DAY_MS = 86_400_000;

function demoMonth(now: number) {
  const days = (now - monthStart(now).getTime()) / DAY_MS;
  const per = (n: number) => Math.round(n * days);
  // Per car per day: four checks of about three requests, the health check's share and 6,000 signals.
  const mineKinds: KindCount[] = [
    { kind: "vehicle_list", count: per(4) },
    { kind: "vehicle_data", count: per(4) },
    { kind: "charging_history", count: per(4) },
    { kind: "telemetry_config", count: per(4) },
    { kind: "telemetry_errors", count: per(4) },
  ];
  const kinds = mineKinds.map((k) => ({ kind: k.kind, count: k.count * 3 }));
  kinds.push({ kind: "release_notes", count: 6 }, { kind: "region", count: 4 });
  const signals = per(18_000);
  return { kinds, signals, total: priceUsage(kinds, signals), mine: priceUsage(mineKinds, per(6_000)) };
}
