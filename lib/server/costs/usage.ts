import "server-only";
import {
  type CostLine,
  type GoogleCounts,
  googleEstimate,
  GOOGLE_SKUS,
  type GoogleSku,
  monthWindow,
  TESLA_MONTHLY_CREDIT_USD,
} from "@/lib/costs";
import { driveWordingCostSince, googleUsageFor } from "../data/system";
import type { KindCount } from "@/lib/tesla-billing";
import { accountKinds, type BudgetState, stateFor, type UserCost } from "../usage";

// Tesla Fleet API and Google Maps Platform are billed on use, and Uplink counts its own calls. Tesla's
// count is api_usage (docs/tesla-billing.md); Google's is google_usage, from the place lookups
// (docs/place-names.md).

// ---- Tesla Fleet API ----

// This calendar month's estimated cost in USD so far, before Tesla's monthly credit, and what it's made of:
// requests per kind, streamed signals, each user's share, and where it leaves the budget (the check cadence).
export type TeslaUsage = { estimatedUsd: number; kinds: KindCount[]; signals: number; users: UserCost[]; budget: BudgetState };
export type TeslaUsageSource = (now: number) => Promise<TeslaUsage | null>;

// The developer account's month to date, the same figure as /admin's Tesla line. Null before the api_usage
// migration, when nothing is counted.
export const teslaUsage: TeslaUsageSource = async (now) => {
  const { kinds, signals, usage, users, counted } = await accountKinds(now);
  return counted ? { estimatedUsd: usage.costUsd, kinds, signals, users, budget: stateFor(usage.costUsd) } : null;
};

export const TESLA_BILLING_LINK = "https://developer.tesla.com/dashboard";

export function teslaLine(usage: TeslaUsage | null, now: number): CostLine {
  const { resetsOn } = monthWindow(now);
  return {
    id: "tesla",
    name: "Tesla Fleet API",
    amount: usage ? usage.estimatedUsd : null,
    period: "monthly",
    resetsOn,
    source: "estimated",
    link: TESLA_BILLING_LINK,
    state: usage ? "ok" : "not-tracked",
    allowance: TESLA_MONTHLY_CREDIT_USD,
  };
}

// ---- Google Maps Platform ----

// This calendar month's billable calls per SKU (lib/costs.ts GOOGLE_SKUS). Count each call under the SKU
// its field mask bills: Place Details with only Essentials fields is placeDetailsEssentials, and so on.
export type GoogleUsageSource = (monthStart: string) => Promise<GoogleCounts | null>;

// The naming sheet's calls (lib/server/place-suggestions.ts), counted in google_usage per SKU: each open
// makes one Nearby Search Pro call, and each search one Autocomplete call. Null before the migration: "Not
// tracked yet".
export const googleUsage: GoogleUsageSource = async (monthStart) => {
  const rows = await googleUsageFor(monthStart.slice(0, 10));
  if (!rows) return null;
  const counts: GoogleCounts = {};
  for (const [sku, n] of Object.entries(rows)) if (sku in GOOGLE_SKUS) counts[sku as GoogleSku] = n;
  return counts;
};

export const GOOGLE_BILLING_LINK = "https://console.cloud.google.com/billing";

export function googleLine(counts: GoogleCounts | null, budgetUsd: number | null, now: number): CostLine {
  const { resetsOn } = monthWindow(now);
  return {
    id: "google",
    name: "Google Maps Platform",
    amount: counts ? googleEstimate(counts) : null,
    period: "monthly",
    resetsOn,
    source: "estimated",
    link: GOOGLE_BILLING_LINK,
    state: counts ? "ok" : "not-tracked",
    budget: budgetUsd,
  };
}

// ---- OpenRouter: the drive page's AI wording ----

// Each call's cost is stored with its wording (drive_wording.cost_usd), so the month's spend is their sum.
export const OPENROUTER_LINK = "https://openrouter.ai/activity";

export function openRouterLine(spentUsd: number | null, now: number): CostLine {
  const { resetsOn } = monthWindow(now);
  return {
    id: "openrouter",
    name: "OpenRouter",
    amount: spentUsd,
    period: "monthly",
    resetsOn,
    source: "live",
    link: OPENROUTER_LINK,
    state: spentUsd === null ? "not-tracked" : "ok",
    note: "AI wording on drive pages, Claude Haiku",
  };
}

// A source that fails reads as not tracked rather than breaking the page.
export async function safely<T>(read: () => Promise<T | null>, what: string): Promise<T | null> {
  try {
    return await read();
  } catch (err) {
    console.warn(`${what} usage unavailable:`, err instanceof Error ? err.name : "error");
    return null;
  }
}
