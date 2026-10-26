import "server-only";
import {
  type CostLine,
  type GoogleCounts,
  googleEstimate,
  monthWindow,
  TESLA_MONTHLY_CREDIT_USD,
} from "@/lib/costs";

// Tesla Fleet API and Google Maps Platform are billed on use, and Uplink counts its own calls. The counters
// are built elsewhere (Tesla: api_usage and its helpers; Google: the place lookups); this file only says
// what it needs from them. Until they're wired in at merge, each source returns null: "Not tracked yet".

// ---- Tesla Fleet API ----

// This calendar month's estimated cost in USD, before Tesla's monthly credit.
export type TeslaUsage = { estimatedUsd: number };
export type TeslaUsageSource = (monthStart: string) => Promise<TeslaUsage | null>;

// Wire the usage helper in here, e.g. `async (from) => ({ estimatedUsd: await teslaCostSince(from) })`.
export const teslaUsage: TeslaUsageSource = async () => null;

export const TESLA_BILLING_LINK = "https://developer.tesla.com/dashboard";

export function teslaLine(usage: TeslaUsage | null, now: number): CostLine {
  const { resetsOn } = monthWindow(now);
  return {
    id: "tesla",
    name: "Tesla Fleet API",
    amount: usage ? usage.estimatedUsd : null,
    currency: "USD",
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

// Wire the lookup counter in here.
export const googleUsage: GoogleUsageSource = async () => null;

export const GOOGLE_BILLING_LINK = "https://console.cloud.google.com/billing";

export function googleLine(counts: GoogleCounts | null, budgetUsd: number | null, now: number): CostLine {
  const { resetsOn } = monthWindow(now);
  return {
    id: "google",
    name: "Google Maps Platform",
    amount: counts ? googleEstimate(counts) : null,
    currency: "USD",
    period: "monthly",
    resetsOn,
    source: "estimated",
    link: GOOGLE_BILLING_LINK,
    state: counts ? "ok" : "not-tracked",
    budget: budgetUsd,
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
