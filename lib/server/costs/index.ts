import "server-only";
import { type CostLine, type EntryValues, type GoogleCounts, monthWindow, nextRenewal, toUsd } from "@/lib/costs";
import { DEMO } from "@/lib/demo";
import { istDay } from "@/lib/status";
import { type CostEntryRow, costEntries, type CostSetting, costSettings, saveCostSetting } from "../data/costs";
import { domainLine, readDomain } from "./domain";
import { flyLine, readFly } from "./fly";
import { readSupabase, supabaseLine } from "./supabase-billing";
import { googleLine, googleUsage, safely, teslaLine, type TeslaUsage, teslaUsage } from "./usage";
import { describeFailure, readVercel, type VercelSnapshot, vercelLine } from "./vercel";

// /admin/costs: one line per service, in dollars, and what the forms for added rows start with.

export const COSTS_TAG = "admin-costs";

// An added row's form: its id and its values.
export type Editable = { target: string; values: EntryValues };

export type CostsPage = {
  simulated: boolean;
  ready: boolean; // the tables exist
  lines: CostLine[];
  edit: Record<string, Editable>;
  googleBudgetUsd: number | null;
  // What the Tesla and Google rows are made of, for their breakdowns. Null when not counted.
  tesla: TeslaUsage | null;
  google: GoogleCounts | null;
};

const cents = (n: number) => String(Math.round(n * 100) / 100);

// An owner-added row. One saved in rupees, before the page went dollars only, shows converted ("≈").
function entryLine(r: CostEntryRow, now: number): CostLine {
  return {
    id: `entry-${r.id}`,
    name: r.name,
    amount: toUsd(r.amount, r.currency),
    approx: r.currency === "INR" || undefined,
    period: r.period,
    resetsOn: r.renews_on ? nextRenewal(r.renews_on, r.period, now) : null,
    source: "fixed",
    link: r.link ?? "",
    state: "ok",
  };
}

const values = (r: CostEntryRow): EntryValues => ({
  name: r.name,
  amount: cents(toUsd(r.amount, r.currency)),
  period: r.period,
  renewsOn: r.renews_on ?? "",
  link: r.link ?? "",
});

function snapshotOf(saved: CostSetting | undefined): VercelSnapshot | null {
  const v = saved?.value;
  if (!v || typeof v.amount !== "number" || typeof v.fetchedAt !== "string") return null;
  return { amount: v.amount, plan: typeof v.plan === "string" ? v.plan : null, fetchedAt: v.fetchedAt };
}

// A provider's read that throws (a failure with nothing cached before) shows as Unavailable. The status was
// logged where it was thrown (http.ts providerError); the error's own text could carry a URL, so it isn't.
async function settle<T>(read: () => Promise<T>, what: string, failed: T): Promise<T> {
  try {
    return await read();
  } catch {
    console.warn(`${what} costs unavailable`);
    return failed;
  }
}

// Sample entries for demo mode: every state the page can show, with made-up figures.
async function demoPage(now: number): Promise<CostsPage> {
  // The simulated month /admin and Settings show too.
  const tesla = await teslaUsage(now);
  const google: GoogleCounts = { geocoding: 1200, placeDetailsPro: 36_500 };
  const fetchedAt = new Date(now - 3_600_000).toISOString();
  const lines: CostLine[] = [
    vercelLine({ kind: "ok", amount: 21.4, plan: "pro", fetchedAt }, null, now),
    supabaseLine({ kind: "ok", usd: 25, note: "Pro plan", fetchedAt }, now),
    flyLine({ kind: "ok", usd: 3.88, machines: 1, fetchedAt }, now),
    teslaLine(tesla, now),
    googleLine(google, 5, now),
    domainLine({ kind: "ok", expires: istDay(now + 12 * 86_400_000), fetchedAt }, now),
    { id: "entry-1", name: "Email", amount: 1.5, period: "monthly", resetsOn: null, source: "fixed", link: "https://example.com/billing", state: "ok" },
  ];
  return {
    simulated: true,
    ready: true,
    lines,
    edit: { "entry-1": { target: "1", values: { name: "Email", amount: "1.5", period: "monthly", renewsOn: "", link: "https://example.com/billing" } } },
    googleBudgetUsd: 5,
    tesla,
    google,
  };
}

// Every read fails soft: a failed provider shows its last value or Unavailable, a missing table leaves out
// the added rows, and nothing here throws past a database outage.
export async function loadCosts(now: number): Promise<CostsPage> {
  if (DEMO) return demoPage(now);
  const { from } = monthWindow(now);
  const [entries, settings, vercel, supabase, fly, domain, tesla, google] = await Promise.all([
    costEntries().catch((err) => (console.warn("Cost entries unavailable:", err instanceof Error ? err.message : err), null)),
    costSettings().catch((err) => (console.warn("Cost settings unavailable:", err instanceof Error ? err.message : err), null)),
    readVercel(from),
    settle(readSupabase, "Supabase", { kind: "error" as const }),
    settle(readFly, "Fly.io", { kind: "error" as const }),
    settle(readDomain, "Domain", { kind: "error" as const }),
    safely(() => teslaUsage(now), "Tesla"),
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
  // Rows for Fly.io, Supabase and the domain from when they were typed in are ignored: they're read live.
  const added = (entries ?? []).filter((r) => !r.service);

  const lines: CostLine[] = [
    vercelLine(vercel, last, now),
    supabaseLine(supabase, now),
    flyLine(fly, now),
    teslaLine(tesla, now),
    googleLine(google, googleBudgetUsd, now),
    domainLine(domain, now),
    ...added.map((r) => entryLine(r, now)),
  ];
  const edit: Record<string, Editable> = {};
  for (const r of added) edit[`entry-${r.id}`] = { target: String(r.id), values: values(r) };

  return { simulated: false, ready: entries !== null && settings !== null, lines, edit, googleBudgetUsd, tesla, google };
}
