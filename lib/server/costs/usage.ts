import "server-only";
import {
  type CostLine,
  type GoogleCounts,
  googleEstimate,
  monthWindow,
  TESLA_MONTHLY_CREDIT_USD,
} from "@/lib/costs";
import { accountKinds } from "../usage";

// Tesla Fleet API and Google Maps Platform are billed on use, and Uplink counts its own calls. Tesla's
// count is api_usage (docs/tesla-billing.md); Google's is still to come from the place lookups, so its
// source returns null for now: "Not tracked yet".

// ---- Tesla Fleet API ----

// This calendar month's estimated cost in USD so far, before Tesla's monthly credit.
export type TeslaUsage = { estimatedUsd: number };
export type TeslaUsageSource = (now: number) => Promise<TeslaUsage | null>;

// The developer account's month to date, the same figure as /admin's Tesla API total. Null before the
// api_usage migration, when nothing is counted.
export const teslaUsage: TeslaUsageSource = async (now) => {
  const { usage, counted } = await accountKinds(now);
  return counted ? { estimatedUsd: usage.costUsd } : null;
};

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
