// Tesla's Fleet API prices and Uplink's budget, as plain data and maths. Verified against Tesla's docs on
// 26 Oct 2026: see docs/tesla-billing.md for the sources and what is ambiguous.

import { formatShortDate } from "@/lib/format";

// Tesla's pricing categories.
export const CATEGORIES = ["data", "commands", "wakes", "signals"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_NAMES: Record<Category, string> = {
  data: "Data requests",
  commands: "Commands",
  wakes: "Wakes",
  signals: "Streaming signals",
};

// Dollars per request or signal: 500 data requests, 1,000 commands, 50 wakes or 150,000 signals for $1.
export const PRICE_USD: Record<Category, number> = {
  data: 1 / 500,
  commands: 1 / 1000,
  wakes: 1 / 50,
  signals: 1 / 150_000,
};

// Tesla's monthly discount per developer account.
export const CREDIT_USD = 10;

// Uplink's own names for what it asks Tesla, stored in api_usage.kind. Each maps to a Tesla category below.
export const KINDS = [
  "vehicle_list",
  "vehicle_data",
  "charging_history",
  "charging_invoice",
  "release_notes",
  "telemetry_config",
  "telemetry_errors",
  "region",
  "wake",
  "command",
  "other",
] as const;
export type Kind = (typeof KINDS)[number];

export const KIND_NAMES: Record<Kind, string> = {
  vehicle_list: "Vehicle list",
  vehicle_data: "Vehicle data",
  charging_history: "Charging history",
  charging_invoice: "Invoices",
  release_notes: "Release notes",
  telemetry_config: "Streaming config",
  telemetry_errors: "Streaming errors",
  region: "Sign-up region checks",
  wake: "Wakes",
  command: "Commands",
  other: "Other",
};

// Tesla's docs don't publish each endpoint's category (see docs/tesla-billing.md), so everything but a wake
// or a command is priced as data, the dearer guess. Only this map changes when Tesla's categories are known.
export const CATEGORY_OF: Record<Kind, Category> = {
  vehicle_list: "data",
  vehicle_data: "data",
  charging_history: "data",
  charging_invoice: "data",
  release_notes: "data",
  telemetry_config: "data",
  telemetry_errors: "data",
  region: "data",
  wake: "wakes",
  command: "commands",
  other: "data",
};

// Which kind a Fleet API request is, from its method and path (query string allowed).
export function kindOf(method: string, path: string): Kind {
  const p = path.split("?")[0].replace(/\/+$/, "");
  if (/\/command\//.test(p)) return "command";
  if (p === "/api/1/vehicles") return "vehicle_list";
  if (p === "/api/1/users/region") return "region";
  if (p.startsWith("/api/1/dx/charging/history")) return "charging_history";
  if (p.startsWith("/api/1/dx/charging/invoice/")) return "charging_invoice";
  const vehicle = p.match(/^\/api\/1\/vehicles\/[^/]+\/([a-z_]+)$/);
  switch (vehicle?.[1]) {
    case "wake_up":
      return method.toUpperCase() === "POST" ? "wake" : "other";
    case "vehicle_data":
      return "vehicle_data";
    case "release_notes":
      return "release_notes";
    case "fleet_telemetry_config":
      return "telemetry_config";
    case "fleet_telemetry_errors":
      return "telemetry_errors";
    default:
      return "other";
  }
}

// Tesla bills every answer with a status below 500; a 5xx, or no answer at all, isn't billed.
export const isBillable = (status: number) => status > 0 && status < 500;

export type KindCount = { kind: string; count: number };
export type CategoryUsage = { category: Category; count: number; costUsd: number };
export type Usage = { categories: CategoryUsage[]; costUsd: number };

// Counts per kind (an unknown kind counts as "other") and streamed signals, priced by category.
export function priceUsage(kinds: KindCount[], signals: number): Usage {
  const counts: Record<Category, number> = { data: 0, commands: 0, wakes: 0, signals };
  for (const { kind, count } of kinds) {
    const known = (KINDS as readonly string[]).includes(kind) ? (kind as Kind) : "other";
    counts[CATEGORY_OF[known]] += count;
  }
  const categories = CATEGORIES.map((category) => ({ category, count: counts[category], costUsd: counts[category] * PRICE_USD[category] }));
  return { categories, costUsd: categories.reduce((sum, c) => sum + c.costUsd, 0) };
}

// Tesla's billing month starts on the 1st. Its time zone isn't documented; Uplink uses UTC (see the doc).
// The month a moment falls in, as its first day: "2026-10-01".
export function usageMonth(at: number | Date): string {
  const d = new Date(at);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

// When the month after `at` starts (midnight UTC on the 1st): the next reset.
export function nextReset(at: number | Date): Date {
  const d = new Date(at);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

// The month's first instant (midnight UTC on the 1st).
export function monthStart(at: number | Date): Date {
  const d = new Date(at);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

// TESLA_BUDGET_USD: what the developer account may spend in a month by Uplink's estimate. Unset, empty, not
// a number or not above zero is the credit.
export function parseBudget(value: string | undefined): number {
  const n = Number(value?.trim());
  return value?.trim() && Number.isFinite(n) && n > 0 ? n : CREDIT_USD;
}

// Checks slow down from SLOW_AT of the budget, and stop at all of it.
export const SLOW_AT = 0.8;

export type BudgetLevel = "normal" | "slow" | "stopped";

export function budgetLevel(spentUsd: number, budgetUsd: number): BudgetLevel {
  if (spentUsd >= budgetUsd) return "stopped";
  if (spentUsd >= budgetUsd * SLOW_AT) return "slow";
  return "normal";
}

const HOUR = 3_600_000;

// How long after a check the next one is due, at each level. Stopped has none.
export const CHECK_EVERY_MS: Record<Exclude<BudgetLevel, "stopped">, number> = { normal: 6 * HOUR, slow: 12 * HOUR };

// How often checks run at this level, as words: "Every 6 hours", or "Paused until 1 Nov".
export function checkCadence(level: BudgetLevel, resetsAt: string | number | Date): string {
  if (level === "stopped") return `Paused until ${formatShortDate(resetsAt)}`;
  return `Every ${CHECK_EVERY_MS[level] / HOUR} hours`;
}
