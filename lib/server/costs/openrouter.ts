import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { type CostLine, isStale, monthWindow, type Part, usd } from "@/lib/costs";
import { getJson, PROVIDER_COSTS_TAG, providerError } from "./http";

// OpenRouter: everything the app's key spent this month, as OpenRouter counts it: drive wording, AI tips and
// Jev's checks of them. GET /api/v1/key gives the key's month (UTC) and its spend limit, GET /api/v1/credits
// the account's credit. Uses OPENROUTER_API_KEY, the key the app already calls with, server side only.

export const OPENROUTER_LINK = "https://openrouter.ai/activity";

const API = "https://openrouter.ai/api/v1";

export type OpenRouterRead =
  | {
      kind: "ok";
      usd: number; // this month
      totalUsd: number | null; // everything the key has spent
      limitUsd: number | null; // the key's spend limit, if it has one
      limitLeftUsd: number | null;
      creditUsd: number | null; // the account's credit bought, and what's left of it
      creditLeftUsd: number | null;
      fetchedAt: string;
    }
  | { kind: "connect" }
  | { kind: "error" };

type KeyBody = { data?: { usage?: unknown; usage_monthly?: unknown; limit?: unknown; limit_remaining?: unknown } };
type CreditsBody = { data?: { total_credits?: unknown; total_usage?: unknown } };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

// The live read, cached for 15 minutes in the remote cache. A failure throws, so the cache keeps serving the
// last good read and the page says when it was read. The credit read is optional: without it the line stays.
export async function readOpenRouter(): Promise<OpenRouterRead> {
  "use cache: remote";
  cacheTag(PROVIDER_COSTS_TAG);
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) {
    cacheLife("minutes");
    return { kind: "connect" };
  }
  cacheLife({ stale: 300, revalidate: 900, expire: 30 * 86_400 });
  const headers = { Authorization: `Bearer ${key}` };
  const [keyBody, credits] = await Promise.all([
    getJson("OpenRouter", `${API}/key`, headers) as Promise<KeyBody>,
    (getJson("OpenRouter", `${API}/credits`, headers, { quiet: true }) as Promise<CreditsBody>).catch(() => null),
  ]);
  const month = num(keyBody?.data?.usage_monthly);
  if (month === null) throw providerError("OpenRouter", "shape");
  const total = num(credits?.data?.total_credits);
  const used = num(credits?.data?.total_usage);
  return {
    kind: "ok",
    usd: month,
    totalUsd: num(keyBody.data?.usage),
    limitUsd: num(keyBody.data?.limit),
    limitLeftUsd: num(keyBody.data?.limit_remaining),
    creditUsd: total,
    creditLeftUsd: total !== null && used !== null ? Math.max(0, total - used) : null,
    fetchedAt: new Date().toISOString(),
  };
}

export function openRouterLine(read: OpenRouterRead, now: number): CostLine {
  const { resetsOn } = monthWindow(now);
  const base = { id: "openrouter", name: "OpenRouter", period: "monthly", resetsOn, source: "live", link: OPENROUTER_LINK, note: "Drive wording and tips, Claude Haiku" } as const;
  if (read.kind === "connect") return { ...base, amount: null, state: "connect" };
  if (read.kind === "error") return { ...base, amount: null, state: "unavailable" };
  const stale = isStale(read.fetchedAt, now);
  return { ...base, amount: read.usd, state: stale ? "stale" : "ok", asOf: stale ? read.fetchedAt : undefined };
}

// What the key has spent in all, and what's left of its limit and the account's credit.
export function openRouterParts(read: OpenRouterRead): Part[] {
  if (read.kind !== "ok") return [];
  const parts: Part[] = [];
  if (read.totalUsd !== null) parts.push({ label: "Total spent", value: usd(read.totalUsd) });
  if (read.limitUsd !== null && read.limitLeftUsd !== null) parts.push({ label: "Key limit left", value: `${usd(read.limitLeftUsd)} of ${usd(read.limitUsd)}` });
  if (read.creditUsd !== null && read.creditLeftUsd !== null) parts.push({ label: "Credit left", value: `${usd(read.creditLeftUsd)} of ${usd(read.creditUsd)}` });
  return parts;
}
