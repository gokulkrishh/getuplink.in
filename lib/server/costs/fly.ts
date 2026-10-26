import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { type CostLine, FLY_PRICES, flyEstimate, type FlyIp, type FlyMachine, type FlyVolume, isStale } from "@/lib/costs";
import { getJson, PROVIDER_COSTS_TAG, providerError } from "./http";

// Fly.io: the telemetry app's Machines, volumes and IPs from the Machines API, priced at Fly's list prices
// (lib/costs.ts FLY_PRICES). Needs FLY_API_TOKEN, a read-only org token; see docs/costs.md. The token is
// read here, server side, and is never logged, a cache argument or returned.

export const FLY_BILLING_LINK = "https://fly.io/dashboard/personal/billing";
export const FLY_APP = "uplink-telemetry";

const API = "https://api.machines.dev";

export type FlyRead = { kind: "ok"; usd: number; machines: number; fetchedAt: string } | { kind: "connect" } | { kind: "error" };

// `fly tokens create` prints the token with its "FlyV1 " scheme; an older token is a bare Bearer one.
export function flyAuthorization(token: string): string {
  return token.startsWith("FlyV1 ") ? token : `Bearer ${token}`;
}

// The live read, cached for 6 hours in the remote cache. A failure throws, so the cache keeps serving the
// last good read (up to 30 days) and the page says when it was read. A missing token is cached briefly.
export async function readFly(): Promise<FlyRead> {
  "use cache: remote";
  cacheTag(PROVIDER_COSTS_TAG);
  const token = process.env.FLY_API_TOKEN?.trim();
  if (!token) {
    cacheLife("minutes");
    return { kind: "connect" };
  }
  cacheLife({ stale: 300, revalidate: 21_600, expire: 30 * 86_400 });
  const headers = { Authorization: flyAuthorization(token) };
  const app = `${API}/v1/apps/${FLY_APP}`;
  const [machines, volumes, ips] = await Promise.all([
    getJson("Fly.io", `${app}/machines`, headers),
    getJson("Fly.io", `${app}/volumes`, headers),
    getJson("Fly.io", `${app}/ip_assignments`, headers),
  ]);
  const list = (ips as { ips?: unknown } | null)?.ips;
  if (!Array.isArray(machines) || !Array.isArray(volumes) || !Array.isArray(list)) throw providerError("Fly.io", "shape");
  const estimate = flyEstimate({ machines: machines as FlyMachine[], volumes: volumes as FlyVolume[], ips: list as FlyIp[] });
  if (!estimate) throw providerError("Fly.io", "shape");
  return { kind: "ok", usd: estimate.usd, machines: estimate.machines, fetchedAt: new Date().toISOString() };
}

function note(read: Extract<FlyRead, { kind: "ok" }>): string {
  const parts = [read.machines === 1 ? "1 machine, always on" : `${read.machines} machines, always on`];
  if (read.usd > 0 && read.usd < FLY_PRICES.waivedUnder) parts.push("Fly may waive bills under $5");
  return parts.join(". ");
}

export function flyLine(read: FlyRead, now: number): CostLine {
  const base = { id: "fly", name: "Fly.io", period: "monthly", resetsOn: null, source: "estimated", link: FLY_BILLING_LINK } as const;
  if (read.kind === "connect") return { ...base, amount: null, state: "connect" };
  if (read.kind === "error") return { ...base, amount: null, state: "unavailable" };
  const stale = isStale(read.fetchedAt, now);
  return { ...base, amount: read.usd, note: note(read), state: stale ? "stale" : "ok", asOf: stale ? read.fetchedAt : undefined };
}
