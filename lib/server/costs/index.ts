import "server-only";
import {
  type CostLine,
  DEFAULT_USD_INR,
  type EntryValues,
  FIXED_SERVICES,
  type FixedService,
  monthWindow,
  nextRenewal,
  parseRate,
} from "@/lib/costs";
import { DEMO } from "@/lib/demo";
import { istDay } from "@/lib/status";
import { type CostEntryRow, costEntries, type CostSetting, costSettings, saveCostSetting } from "../data/costs";
import { googleLine, googleUsage, safely, teslaLine, teslaUsage } from "./usage";
import { describeFailure, readVercel, type VercelSnapshot, vercelLine } from "./vercel";

// /admin/costs: one line per service, the exchange rate, and what the forms start with.

export const COSTS_TAG = "admin-costs";


// How a line is edited: a built-in service by its key, an added row by its id.
export type Editable = { target: string; values: EntryValues | null; removable: boolean; fixedName: boolean };

export type Rate = { value: number; from: "saved" | "env" | "default"; setAt: string | null };

export type CostsPage = {
  simulated: boolean;
  ready: boolean; // the tables exist
  lines: CostLine[];
  edit: Record<string, Editable>;
  rate: Rate;
  googleBudgetUsd: number | null;
};

const SERVICE_ORDER: FixedService[] = ["supabase", "fly", "domain"];

const values = (r: CostEntryRow): EntryValues => ({
  name: r.name,
  amount: String(r.amount),
  currency: r.currency,
  period: r.period,
  renewsOn: r.renews_on ?? "",
  link: r.link ?? "",
});

function entryLine(r: CostEntryRow, now: number): CostLine {
  const builtIn = r.service ? FIXED_SERVICES[r.service] : null;
  return {
    id: r.service ?? `entry-${r.id}`,
    name: builtIn?.name ?? r.name,
    amount: r.amount,
    currency: r.currency,
    period: r.period,
    resetsOn: r.renews_on ? nextRenewal(r.renews_on, r.period, now) : null,
    source: "fixed",
    link: builtIn?.link ?? r.link ?? "",
    state: "ok",
  };
}

function unsetLine(service: FixedService): CostLine {
  const s = FIXED_SERVICES[service];
  return { id: service, name: s.name, amount: null, currency: "USD", period: s.period, resetsOn: null, source: "fixed", link: s.link, state: "not-set" };
}

export function rateOf(saved: CostSetting | undefined, env: string | undefined): Rate {
  const stored = parseRate(saved?.value.rate as number | undefined);
  if (stored) return { value: stored, from: "saved", setAt: saved!.updated_at };
  const fromEnv = parseRate(env);
  if (fromEnv) return { value: fromEnv, from: "env", setAt: null };
  return { value: DEFAULT_USD_INR, from: "default", setAt: null };
}

function snapshotOf(saved: CostSetting | undefined): VercelSnapshot | null {
  const v = saved?.value;
  if (!v || typeof v.amount !== "number" || typeof v.fetchedAt !== "string") return null;
  return { amount: v.amount, plan: typeof v.plan === "string" ? v.plan : null, fetchedAt: v.fetchedAt };
}

// Sample entries for demo mode: every state the page can show, with made-up figures.
function demoPage(now: number): CostsPage {
  const { resetsOn } = monthWindow(now);
  const inDays = (days: number) => istDay(now + days * 86_400_000);
  const lines: CostLine[] = [
    { id: "vercel", name: "Vercel", amount: 21.4, currency: "USD", period: "monthly", resetsOn, source: "live", link: "https://vercel.com/dashboard/usage", state: "ok", note: "Pro plan" },
    { id: "supabase", name: "Supabase", amount: 25, currency: "USD", period: "monthly", resetsOn: inDays(9), source: "fixed", link: FIXED_SERVICES.supabase.link, state: "ok" },
    { id: "fly", name: "Fly.io", amount: 3.88, currency: "USD", period: "monthly", resetsOn: null, source: "fixed", link: FIXED_SERVICES.fly.link, state: "ok" },
    { ...teslaLine({ estimatedUsd: 12.37 }, now) },
    { ...googleLine({ geocoding: 1200, placeDetailsPro: 36_500 }, 5, now) },
    { id: "domain", name: "Domain", amount: 899, currency: "INR", period: "yearly", resetsOn: inDays(12), source: "fixed", link: FIXED_SERVICES.domain.link, state: "ok" },
    { id: "entry-1", name: "Email", amount: 1.5, currency: "USD", period: "monthly", resetsOn: null, source: "fixed", link: "https://example.com/billing", state: "ok" },
  ];
  const demoValues = (l: CostLine): EntryValues => ({ name: l.name, amount: String(l.amount), currency: l.currency, period: l.period, renewsOn: l.resetsOn ?? "", link: l.link });
  return {
    simulated: true,
    ready: true,
    lines,
    edit: {
      supabase: { target: "supabase", values: demoValues(lines[1]), removable: false, fixedName: true },
      fly: { target: "fly", values: demoValues(lines[2]), removable: false, fixedName: true },
      domain: { target: "domain", values: demoValues(lines[5]), removable: false, fixedName: true },
      "entry-1": { target: "1", values: demoValues(lines[6]), removable: true, fixedName: false },
    },
    rate: { value: DEFAULT_USD_INR, from: "saved", setAt: new Date(now - 3 * 86_400_000).toISOString() },
    googleBudgetUsd: 5,
  };
}

// Every read fails soft: a failed provider shows its last value or Unavailable, a missing table shows
// "Not set", and nothing here throws past a database outage.
export async function loadCosts(now: number): Promise<CostsPage> {
  if (DEMO) return demoPage(now);
  const { from } = monthWindow(now);
  const [entries, settings, vercel, tesla, google] = await Promise.all([
    costEntries().catch((err) => (console.warn("Cost entries unavailable:", err instanceof Error ? err.message : err), null)),
    costSettings().catch((err) => (console.warn("Cost settings unavailable:", err instanceof Error ? err.message : err), null)),
    readVercel(from),
    safely(() => teslaUsage(from), "Tesla"),
    safely(() => googleUsage(from), "Google"),
  ]);

  const failure = describeFailure(vercel);
  if (failure) console.warn(failure);
  const last = snapshotOf(settings?.["snapshot:vercel"]);
  // Keep the newest live read, once per read, so a later failure can show it.
  if (vercel.kind === "ok" && settings && last?.fetchedAt !== vercel.fetchedAt) {
    await saveCostSetting("snapshot:vercel", { amount: vercel.amount, plan: vercel.plan, fetchedAt: vercel.fetchedAt }, vercel.fetchedAt).catch(() => null);
  }

  const budget = settings?.google_budget_usd?.value.usd;
  const googleBudgetUsd = typeof budget === "number" && budget > 0 ? budget : null;
  const rows = entries ?? [];
  const byService = new Map(rows.filter((r) => r.service).map((r) => [r.service as FixedService, r]));
  const added = rows.filter((r) => !r.service);
  const fixed = (service: FixedService) => {
    const r = byService.get(service);
    return r ? entryLine(r, now) : unsetLine(service);
  };

  const lines: CostLine[] = [
    vercelLine(vercel, last, now),
    ...SERVICE_ORDER.slice(0, 2).map(fixed),
    teslaLine(tesla, now),
    googleLine(google, googleBudgetUsd, now),
    fixed("domain"),
    ...added.map((r) => entryLine(r, now)),
  ];
  const edit: Record<string, Editable> = {};
  for (const service of SERVICE_ORDER) {
    const r = byService.get(service);
    edit[service] = { target: service, values: r ? values(r) : null, removable: false, fixedName: true };
  }
  for (const r of added) edit[`entry-${r.id}`] = { target: String(r.id), values: values(r), removable: true, fixedName: false };

  return {
    simulated: false,
    ready: entries !== null && settings !== null,
    lines,
    edit,
    rate: rateOf(settings?.usd_inr, process.env.USD_INR),
    googleBudgetUsd,
  };
}
