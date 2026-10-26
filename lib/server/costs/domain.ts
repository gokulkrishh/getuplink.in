import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { type CostLine, DOMAIN, isStale, rdapExpiry } from "@/lib/costs";
import { type FailureStatus, getJson, PROVIDER_COSTS_TAG, ProviderError } from "./http";

// The domain: its expiry from public RDAP (no account), priced at Namecheap's .in renewal (lib/costs.ts
// DOMAIN). The .in registry's RDAP server first, then rdap.org, which redirects there; see docs/costs.md.

export const DOMAIN_BILLING_LINK = "https://ap.www.namecheap.com/domains/list/";

export const RDAP_BASES = ["https://rdap.nixiregistry.in/rdap/domain/", "https://rdap.org/domain/"];

// Some RDAP servers refuse a request with no User-Agent (a 403 from Vercel).
const HEADERS = { Accept: "application/rdap+json", "User-Agent": "Uplink costs (+https://getuplink.in)" };

export type DomainRead = { kind: "ok"; expires: string; fetchedAt: string } | { kind: "error" };

// Each RDAP base in turn. Never throws: when every base fails it logs one warning, with each status, and
// returns an error read, so the row keeps its price and says the renewal date is unavailable.
export async function lookupDomain(fetcher: typeof fetch = fetch): Promise<DomainRead> {
  const failed: FailureStatus[] = [];
  for (const base of RDAP_BASES) {
    try {
      const found = rdapExpiry(await getJson("RDAP", `${base}${DOMAIN.name}`, HEADERS, { quiet: true, fetcher }));
      if (found) return { kind: "ok", expires: found.expires, fetchedAt: new Date().toISOString() };
      failed.push("shape");
    } catch (err) {
      failed.push(err instanceof ProviderError ? err.status : "network");
    }
  }
  console.warn(`Costs read failed: RDAP ${failed.join(", ")}`);
  return { kind: "error" };
}

// The live read, in the remote cache: a good read for 6 hours, a failed one for 30 minutes. A failure is
// returned, not thrown, because an error leaving a cache scope lands in the runtime error logs.
export async function readDomain(): Promise<DomainRead> {
  "use cache: remote";
  cacheTag(PROVIDER_COSTS_TAG);
  const read = await lookupDomain();
  if (read.kind === "error") cacheLife({ stale: 300, revalidate: 1800, expire: 3600 });
  else cacheLife({ stale: 300, revalidate: 21_600, expire: 30 * 86_400 });
  return read;
}

export function domainLine(read: DomainRead, now: number): CostLine {
  const base = { id: "domain", name: "Domain", period: "yearly", source: "estimated", link: DOMAIN_BILLING_LINK, note: DOMAIN.name } as const;
  // The price is known without RDAP; only the renewal date is lost.
  if (read.kind === "error") return { ...base, amount: DOMAIN.renewalUsd, resetsOn: null, state: "ok", note: `${DOMAIN.name}. Renewal date unavailable` };
  const stale = isStale(read.fetchedAt, now);
  return { ...base, amount: DOMAIN.renewalUsd, resetsOn: read.expires, state: stale ? "stale" : "ok", asOf: stale ? read.fetchedAt : undefined };
}
