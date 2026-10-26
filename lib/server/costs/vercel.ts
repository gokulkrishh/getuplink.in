import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { type CostLine, monthWindow, sumFocusCharges } from "@/lib/costs";

// Vercel: this month's charges from the REST API (GET /v1/billing/charges, FOCUS v1.3 JSONL) and the plan
// (GET /v2/teams/{teamId}, billing.plan). Needs VERCEL_API_TOKEN and VERCEL_TEAM_ID; see docs/costs.md.
// The token is read here, server side, and is never logged, cached as an argument or returned.

export const VERCEL_BILLING_LINK = "https://vercel.com/dashboard/usage";
export const VERCEL_COSTS_TAG = "admin-costs-vercel";

const API = "https://api.vercel.com";
const TIMEOUT_MS = 8000;

export type VercelRead =
  | { kind: "ok"; amount: number; plan: string | null; fetchedAt: string }
  | { kind: "connect" }
  | { kind: "error"; status: number | "timeout" | "network" | "body" };

export function vercelConfigured(): boolean {
  return Boolean(process.env.VERCEL_API_TOKEN?.trim() && process.env.VERCEL_TEAM_ID?.trim());
}

async function get(path: string, params: Record<string, string>): Promise<Response> {
  const url = new URL(path, API);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return fetch(url, {
    headers: { Authorization: `Bearer ${process.env.VERCEL_API_TOKEN?.trim()}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
}

function failure(err: unknown): VercelRead {
  const name = err instanceof Error ? err.name : "";
  return { kind: "error", status: name === "TimeoutError" || name === "AbortError" ? "timeout" : "network" };
}

// The live read, cached for an hour in the remote cache (shared across instances). A failure is cached for
// a few minutes only, so a passing outage doesn't hide the figure for an hour. `month` (the window's start)
// is the only argument, so a new month starts a new entry. The `to` is the start of tomorrow, so charges
// so far this month; a read that crosses midnight UTC can miss the newest day until the hour is up.
export async function readVercel(month: string): Promise<VercelRead> {
  "use cache: remote";
  cacheTag(VERCEL_COSTS_TAG);
  // The clock is read inside the cache: an argument would make every call a new entry.
  const now = Date.now();
  if (!vercelConfigured()) {
    cacheLife("minutes");
    return { kind: "connect" };
  }
  const teamId = process.env.VERCEL_TEAM_ID!.trim();
  const window = monthWindow(now);
  try {
    const [charges, team] = await Promise.all([
      get("/v1/billing/charges", { teamId, from: month, to: window.to }),
      get(`/v2/teams/${encodeURIComponent(teamId)}`, {}).catch(() => null),
    ]);
    if (!charges.ok) {
      cacheLife("minutes");
      return { kind: "error", status: charges.status };
    }
    const sum = sumFocusCharges(await charges.text());
    if (!sum) {
      cacheLife("minutes");
      return { kind: "error", status: "body" };
    }
    // The plan is a nice-to-have: if its call fails, the amount still shows.
    let plan: string | null = null;
    if (team?.ok) {
      const body = (await team.json().catch(() => null)) as { billing?: { plan?: unknown } | null } | null;
      plan = typeof body?.billing?.plan === "string" ? body.billing.plan : null;
    }
    cacheLife("hours");
    return { kind: "ok", amount: sum.total, plan, fetchedAt: new Date(now).toISOString() };
  } catch (err) {
    cacheLife("minutes");
    return failure(err);
  }
}

const PLANS: Record<string, string> = { hobby: "Hobby plan", pro: "Pro plan", enterprise: "Enterprise plan" };

export type VercelSnapshot = { amount: number; plan: string | null; fetchedAt: string };

// The line: the live amount, or on failure the last one read (stale), or Unavailable.
export function vercelLine(read: VercelRead, last: VercelSnapshot | null, now: number): CostLine {
  const { resetsOn } = monthWindow(now);
  const base = { id: "vercel", name: "Vercel", period: "monthly", resetsOn, source: "live", link: VERCEL_BILLING_LINK } as const;
  if (read.kind === "connect") return { ...base, amount: null, state: "connect" };
  if (read.kind === "ok") return { ...base, amount: read.amount, state: "ok", note: read.plan ? PLANS[read.plan] ?? read.plan : undefined };
  if (last) return { ...base, amount: last.amount, state: "stale", asOf: last.fetchedAt, note: last.plan ? PLANS[last.plan] ?? last.plan : undefined };
  return { ...base, amount: null, state: "unavailable" };
}

// What goes in the log: the status only, never the URL, headers or body.
export function describeFailure(read: VercelRead): string | null {
  return read.kind === "error" ? `Vercel billing unavailable (${read.status})` : null;
}
