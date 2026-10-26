import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { type CostLine, isStale, type SupabaseAddon, type SupabaseProject, supabaseEstimate } from "@/lib/costs";
import { getJson, PROVIDER_COSTS_TAG, providerError } from "./http";

// Supabase: the org's plan and each project's add-ons from the Management API, priced at Supabase's list
// prices (lib/costs.ts SUPABASE_PRICES). Needs SUPABASE_ACCESS_TOKEN, a personal access token; see
// docs/costs.md. The token is read here, server side, and is never logged, a cache argument or returned.

export const SUPABASE_BILLING_LINK = "https://supabase.com/dashboard/org/_/billing";

const API = "https://api.supabase.com";
// Uplink's project, when SUPABASE_URL isn't a hosted project URL.
const DEFAULT_REF = "fhoqjkriyqwoblfaahpk";
const MAX_PROJECTS = 20;

export type SupabaseRead = { kind: "ok"; usd: number | null; note: string; fetchedAt: string } | { kind: "connect" } | { kind: "error" };

// The project ref from SUPABASE_URL (https://<ref>.supabase.co), or Uplink's own.
export function projectRef(url = process.env.SUPABASE_URL): string {
  try {
    const host = new URL(url ?? "").hostname;
    const ref = host.endsWith(".supabase.co") ? host.split(".")[0] : "";
    return /^[a-z]{20}$/.test(ref) ? ref : DEFAULT_REF;
  } catch {
    return DEFAULT_REF;
  }
}

type Project = { ref?: unknown; organization_slug?: unknown; status?: unknown };

// The live read, cached for 6 hours in the remote cache. A failure throws, so the cache keeps serving the
// last good read (up to 30 days) and the page says when it was read. A missing token is cached briefly.
export async function readSupabase(): Promise<SupabaseRead> {
  "use cache: remote";
  cacheTag(PROVIDER_COSTS_TAG);
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (!token) {
    cacheLife("minutes");
    return { kind: "connect" };
  }
  cacheLife({ stale: 300, revalidate: 21_600, expire: 30 * 86_400 });
  const auth = { Authorization: `Bearer ${token}` };
  const projects = await getJson("Supabase", `${API}/v1/projects`, auth);
  if (!Array.isArray(projects)) throw providerError("Supabase", "shape");
  const ref = projectRef();
  const org = (projects as Project[]).find((p) => p?.ref === ref)?.organization_slug;
  if (typeof org !== "string" || !/^[\w-]+$/.test(org)) throw providerError("Supabase", "shape");
  const body = (await getJson("Supabase", `${API}/v1/organizations/${encodeURIComponent(org)}`, auth)) as { plan?: unknown } | null;
  const plan = typeof body?.plan === "string" ? body.plan : null;
  if (!plan) throw providerError("Supabase", "shape");

  // Add-ons only cost on a paid plan. GET /v1/projects lists every org the token can see: keep this one's.
  const priced: SupabaseProject[] = [];
  if (plan !== "free") {
    const inOrg = (projects as Project[]).filter((p) => p?.organization_slug === org && typeof p.ref === "string").slice(0, MAX_PROJECTS);
    for (const p of inOrg) {
      const addons = (await getJson("Supabase", `${API}/v1/projects/${encodeURIComponent(p.ref as string)}/billing/addons`, auth)) as {
        selected_addons?: unknown;
      } | null;
      if (!Array.isArray(addons?.selected_addons)) throw providerError("Supabase", "shape");
      priced.push({ status: String(p.status ?? ""), addons: addons.selected_addons as SupabaseAddon[] });
    }
  }
  const { usd, note } = supabaseEstimate(plan, priced);
  return { kind: "ok", usd, note, fetchedAt: new Date().toISOString() };
}

export function supabaseLine(read: SupabaseRead, now: number): CostLine {
  const base = { id: "supabase", name: "Supabase", period: "monthly", resetsOn: null, source: "estimated", link: SUPABASE_BILLING_LINK } as const;
  if (read.kind === "connect") return { ...base, amount: null, state: "connect" };
  if (read.kind === "error") return { ...base, amount: null, state: "unavailable" };
  const stale = isStale(read.fetchedAt, now);
  return { ...base, amount: read.usd, note: read.note, state: read.usd === null ? "unavailable" : stale ? "stale" : "ok", asOf: stale ? read.fetchedAt : undefined };
}
