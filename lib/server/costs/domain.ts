import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { type CostLine, DOMAIN, isStale, rdapExpiry } from "@/lib/costs";
import { getJson, PROVIDER_COSTS_TAG, providerError } from "./http";

// The domain: its expiry from public RDAP (no account), priced at Namecheap's .in renewal (lib/costs.ts
// DOMAIN). rdap.org redirects to the .in registry's RDAP server; see docs/costs.md.

export const DOMAIN_BILLING_LINK = "https://ap.www.namecheap.com/domains/list/";

const RDAP = "https://rdap.org/domain/";

export type DomainRead = { kind: "ok"; expires: string; fetchedAt: string } | { kind: "error" };

// The live read, cached for 6 hours in the remote cache. A failure throws, so the cache keeps serving the
// last good read (up to 30 days) and the page says when it was read.
export async function readDomain(): Promise<DomainRead> {
  "use cache: remote";
  cacheTag(PROVIDER_COSTS_TAG);
  cacheLife({ stale: 300, revalidate: 21_600, expire: 30 * 86_400 });
  const body = await getJson("RDAP", `${RDAP}${DOMAIN.name}`, { Accept: "application/rdap+json" });
  const found = rdapExpiry(body);
  if (!found) throw providerError("RDAP", "shape");
  return { kind: "ok", expires: found.expires, fetchedAt: new Date().toISOString() };
}

export function domainLine(read: DomainRead, now: number): CostLine {
  const base = { id: "domain", name: "Domain", period: "yearly", source: "estimated", link: DOMAIN_BILLING_LINK, note: DOMAIN.name } as const;
  // The price is known without RDAP; only the renewal date is lost.
  if (read.kind === "error") return { ...base, amount: DOMAIN.renewalUsd, resetsOn: null, state: "ok", note: `${DOMAIN.name}. Renewal date unavailable` };
  const stale = isStale(read.fetchedAt, now);
  return { ...base, amount: DOMAIN.renewalUsd, resetsOn: read.expires, state: stale ? "stale" : "ok", asOf: stale ? read.fetchedAt : undefined };
}
