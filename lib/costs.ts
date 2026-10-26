import { z } from "zod";
import { formatCount, formatDate, formatMoney } from "@/lib/format";
import { istDay } from "@/lib/status";
import { type BudgetLevel, checkCadence, CREDIT_USD, type Kind, type KindCount, KIND_NAMES, nextReset } from "@/lib/tesla-billing";

// What running Uplink costs, without the network or the database: the shape every provider returns, the
// period maths, renewals, each provider's price table and estimate, and the checks on what the owner types
// in. Everything is in US dollars. Sources and prices are recorded in docs/costs.md.

export const CURRENCIES = ["INR", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const PERIODS = ["monthly", "yearly"] as const;
export type Period = (typeof PERIODS)[number];
export type Source = "live" | "estimated" | "fixed";

// Why a line has no amount, or why its amount is old.
export type CostState =
  | "ok"
  | "stale" // the amount is the last value read, at `asOf`: a refresh failed or hasn't run yet
  | "connect" // a token isn't set; no figure
  | "unavailable" // the live call failed and nothing was read before
  | "not-tracked" // the usage counter isn't wired yet
  | "not-set"; // a fixed entry the owner hasn't entered

// One service's cost this period, in USD; for a yearly line it is the whole year. `approx` marks a row
// saved in rupees before the page went dollars only, converted at LEGACY_USD_INR. `allowance` is a credit
// the provider takes off before charging (Tesla's monthly $10): the line charges what's left. `budget` is
// the owner's own limit (Google).
export type CostLine = {
  id: string;
  name: string;
  amount: number | null;
  period: Period;
  resetsOn: string | null; // YYYY-MM-DD: when the period resets or the cost renews
  source: Source;
  link: string;
  state: CostState;
  note?: string;
  asOf?: string; // ISO time the amount was read, for a stale value
  approx?: boolean;
  allowance?: number;
  budget?: number | null;
};

// Rows saved in rupees before the page went dollars only show at this fixed rate, marked "≈". New rows are
// in dollars.
export const LEGACY_USD_INR = 84;

export function toUsd(amount: number, currency: Currency): number {
  return currency === "USD" ? amount : amount / LEGACY_USD_INR;
}

export const usd = (amount: number) => formatMoney(amount, "USD");

// What the line adds to this month: a yearly cost counts as a twelfth, and an allowance comes off first.
export function monthlyCharge(line: Pick<CostLine, "amount" | "period" | "allowance">): number | null {
  if (line.amount === null) return null;
  const charged = Math.max(0, line.amount - (line.allowance ?? 0));
  return line.period === "yearly" ? charged / 12 : charged;
}

export type Total = { usd: number; counted: number; yearly: number; missing: Pick<CostLine, "id" | "name">[] };

// The month's total, from the lines themselves. A line with no amount adds nothing and is named in
// `missing`, so the header can say which services the total leaves out.
export function monthlyTotal(lines: CostLine[]): Total {
  let total = 0;
  let counted = 0;
  let yearly = 0;
  const missing: Pick<CostLine, "id" | "name">[] = [];
  for (const line of lines) {
    const share = monthlyCharge(line);
    if (share === null) {
      missing.push({ id: line.id, name: line.name });
      continue;
    }
    total += share;
    counted++;
    if (line.period === "yearly") yearly++;
  }
  return { usd: total, counted, yearly, missing };
}

// A cost that renews on a date (the domain, an owner's entry) rather than resetting with a usage month.
// These read "Renews" and get the 30-day alert.
export function renews(line: Pick<CostLine, "source" | "period">): boolean {
  return line.source === "fixed" || line.period === "yearly";
}

// ---- Dates ----

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// The same day `months` later, clamped to the month's end: 31 Jan plus one month is 28 or 29 Feb, and
// 29 Feb plus a year is 28 Feb.
function addMonths(day: string, months: number, wanted = Number(day.slice(8, 10))): string {
  const [y, m] = day.split("-").map(Number);
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = index % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(wanted, last))).toISOString().slice(0, 10);
}

// A renewal date that has passed rolls on to its next one, keeping its day of the month.
export function nextRenewal(day: string, period: Period, now: number): string {
  const today = istDay(now);
  const step = period === "yearly" ? 12 : 1;
  const wanted = Number(day.slice(8, 10));
  let next = day;
  for (let k = 1; next < today; k++) next = addMonths(day, k * step, wanted);
  return next;
}

// Whole days from today (IST) to `day`: 0 today, 1 tomorrow.
export function daysUntil(day: string, now: number): number {
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${istDay(now)}T00:00:00Z`)) / 86_400_000);
}

export const RENEWAL_DAYS = 30;

// Renews today or within the next 30 days, the 30th day included.
export function renewsSoon(day: string | null, now: number, within = RENEWAL_DAYS): boolean {
  if (!day) return false;
  const days = daysUntil(day, now);
  return days >= 0 && days <= within;
}

// Calendar months in UTC, as Vercel's and Tesla's billing count them. `from` is the 1st at 00:00Z, `to`
// the start of tomorrow (exclusive), and the period resets on the 1st of next month.
export function monthWindow(now: number): { from: string; to: string; resetsOn: string } {
  const d = new Date(now);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  return {
    from: new Date(Date.UTC(y, m, 1)).toISOString(),
    to: new Date(Date.UTC(y, m, d.getUTCDate() + 1)).toISOString(),
    resetsOn: new Date(Date.UTC(y, m + 1, 1)).toISOString().slice(0, 10),
  };
}

// A provider's read is refreshed every 6 hours. Older than this, the line says when it was read.
export const PROVIDER_REFRESH_MS = 6 * 3_600_000;
export const STALE_AFTER_MS = 7 * 3_600_000;

export function isStale(fetchedAt: string, now: number): boolean {
  const at = Date.parse(fetchedAt);
  return Number.isFinite(at) && now - at > STALE_AFTER_MS;
}

// ---- Vercel: FOCUS charges, one JSON object per line ----

// The sum of BilledCost over every row, whatever its ChargeCategory: usage, purchases and tax add, credits
// are negative. Null when the body has no rows that parse, so an odd response reads as unknown, not $0.
// The docs' example shows BilledCost as a string and the schema as a number, so both are read.
export function sumFocusCharges(body: string): { total: number; rows: number } | null {
  let total = 0;
  let rows = 0;
  let bad = 0;
  for (const line of body.split("\n")) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as { BilledCost?: unknown; BillingCurrency?: unknown };
      const cost = Number(row.BilledCost);
      if (!Number.isFinite(cost) || (row.BillingCurrency !== undefined && row.BillingCurrency !== "USD")) {
        bad++;
        continue;
      }
      total += cost;
      rows++;
    } catch {
      bad++;
    }
  }
  if (bad > 0) return null;
  return { total, rows };
}

// ---- Supabase: plan and add-ons at list prices (docs/costs.md, checked 26 Oct 2026) ----

export const SUPABASE_PRICES = {
  checked: "2026-10-26",
  // Monthly, per organization.
  plans: { free: 0, pro: 25, team: 599 } as Record<string, number>,
  // Pro and Team include $10 a month of compute, enough for one Micro instance.
  computeCredit: 10,
  // Monthly, per project.
  compute: {
    ci_micro: 10,
    ci_small: 15,
    ci_medium: 60,
    ci_large: 110,
    ci_xlarge: 210,
    ci_2xlarge: 410,
    ci_4xlarge: 960,
    ci_8xlarge: 1870,
    ci_12xlarge: 2800,
    ci_16xlarge: 3730,
  } as Record<string, number>,
  // Monthly, per project, by add-on variant or type. Phone MFA is $75 for the first project, $10 after.
  addons: { custom_domain: 10, pitr_7: 100, pitr_14: 200, pitr_28: 400, log_drain: 60, auth_mfa_phone: 75 } as Record<string, number>,
  mfaPhoneMore: 10,
};

// An hourly add-on price, for a month.
export const HOURS_A_MONTH = 730;

const PLAN_NAMES: Record<string, string> = { free: "Free", pro: "Pro", team: "Team", enterprise: "Enterprise", platform: "Platform" };

// The add-ons Supabase's GET /v1/projects/{ref}/billing/addons lists as selected.
export type SupabaseAddon = {
  type?: unknown;
  variant?: { id?: unknown; name?: unknown; price?: { type?: unknown; interval?: unknown; amount?: unknown } };
};
export type SupabaseProject = { status: string; addons: SupabaseAddon[] };

// Projects that aren't running aren't charged compute.
const NOT_BILLED = new Set(["INACTIVE", "REMOVED", "PAUSING", "GOING_DOWN", "INIT_FAILED"]);

// The add-on's own price from the API: a fixed monthly or hourly amount. Usage-priced ones add nothing.
function apiPrice(addon: SupabaseAddon): number {
  const p = addon.variant?.price;
  const amount = Number(p?.amount);
  if (p?.type !== "fixed" || !Number.isFinite(amount) || amount < 0) return 0;
  return p.interval === "hourly" ? amount * HOURS_A_MONTH : amount;
}

// The org's month, in USD: the plan, compute past the $10 credit, and add-ons. Null for a plan with custom
// pricing (Enterprise) or one Supabase doesn't list. Usage past the plan's quotas isn't counted.
export function supabaseEstimate(plan: string, projects: SupabaseProject[]): { usd: number | null; note: string } {
  const name = PLAN_NAMES[plan] ?? plan;
  const base = SUPABASE_PRICES.plans[plan];
  if (base === undefined) return { usd: null, note: `${name} plan, custom pricing` };
  if (plan === "free") return { usd: 0, note: "Free plan" };
  let compute = 0;
  let addons = 0;
  let mfaPhone = 0;
  let count = 0;
  for (const project of projects) {
    if (NOT_BILLED.has(project.status)) continue;
    let size: number | null = null;
    for (const addon of project.addons) {
      const id = typeof addon.variant?.id === "string" ? addon.variant.id : "";
      if (addon.type === "compute_instance") {
        size = SUPABASE_PRICES.compute[id] ?? apiPrice(addon);
        continue;
      }
      count++;
      if (addon.type === "auth_mfa_phone") {
        addons += mfaPhone++ === 0 ? SUPABASE_PRICES.addons.auth_mfa_phone : SUPABASE_PRICES.mfaPhoneMore;
        continue;
      }
      const listed = SUPABASE_PRICES.addons[id] ?? SUPABASE_PRICES.addons[String(addon.type)];
      addons += listed ?? apiPrice(addon);
    }
    // A paid project with no compute listed runs on Micro.
    compute += size ?? SUPABASE_PRICES.compute.ci_micro;
  }
  const usd = base + Math.max(0, compute - SUPABASE_PRICES.computeCredit) + addons;
  return { usd, note: count > 0 ? `${name} plan, ${count === 1 ? "1 add-on" : `${count} add-ons`}` : `${name} plan` };
}

// ---- Fly.io: Machines at list prices (docs/costs.md, checked 26 Oct 2026) ----

// Started Machines, per 30 days, in the cheapest regions (iad, ewr); other regions cost a little more.
// The published presets are a CPU price that includes some RAM, plus $6 a GB past it.
export const FLY_PRICES = {
  checked: "2026-10-26",
  shared: { cpu: 2.19, includedMb: 256 },
  performance: { cpu: 33, includedMb: 2048 },
  ramPerGb: 6,
  volumePerGb: 0.15,
  ipv4: 2,
  // Fly has voided monthly invoices under $5, informally (docs/costs.md).
  waivedUnder: 5,
};

export type FlyGuest = { cpu_kind?: unknown; cpus?: unknown; memory_mb?: unknown };
export type FlyMachine = { state?: unknown; config?: { guest?: FlyGuest } };
export type FlyVolume = { size_gb?: unknown; state?: unknown };
export type FlyIp = { ip?: unknown; shared?: unknown; egress?: unknown };

// One Machine running for a month. Null for a kind Fly doesn't price this way (a GPU).
export function machineMonthly(guest: FlyGuest | undefined): number | null {
  const kind = guest?.cpu_kind ?? "shared";
  if (kind !== "shared" && kind !== "performance") return null;
  const cpus = Number(guest?.cpus ?? 1);
  const memory = Number(guest?.memory_mb ?? 256);
  if (!Number.isInteger(cpus) || cpus < 1 || !Number.isFinite(memory) || memory <= 0) return null;
  const price = FLY_PRICES[kind];
  const extraGb = Math.max(0, memory - cpus * price.includedMb) / 1024;
  return cpus * price.cpu + extraGb * FLY_PRICES.ramPerGb;
}

const GONE = new Set(["destroyed", "destroying", "pending_destroy"]);

// The app's month in USD, with every Machine assumed running all month: the Machines API has no runtime.
// Volumes are billed whether attached or not. Dedicated IPv4 is a v4 address that isn't shared.
export function flyEstimate(input: { machines: FlyMachine[]; volumes: FlyVolume[]; ips: FlyIp[] }): { usd: number; machines: number } | null {
  let total = 0;
  let machines = 0;
  for (const m of input.machines) {
    if (GONE.has(String(m.state))) continue;
    const price = machineMonthly(m.config?.guest);
    if (price === null) return null;
    total += price;
    machines++;
  }
  for (const v of input.volumes) {
    const gb = Number(v.size_gb);
    if (GONE.has(String(v.state)) || !Number.isFinite(gb) || gb <= 0) continue;
    total += gb * FLY_PRICES.volumePerGb;
  }
  for (const ip of input.ips) {
    if (typeof ip.ip === "string" && ip.ip.includes(".") && ip.shared !== true && ip.egress !== true) total += FLY_PRICES.ipv4;
  }
  return { usd: total, machines };
}

// ---- The domain: expiry from RDAP, Namecheap's renewal price ----

export const DOMAIN = {
  name: "getuplink.in",
  // Namecheap's regular .in renewal, a year (docs/costs.md).
  renewalUsd: 13.42,
  checked: "2026-10-26",
};

// The expiry day (IST) in an RDAP domain response (RFC 9083 events), and who registered it.
export function rdapExpiry(body: unknown): { expires: string; registrar: string | null } | null {
  const events = (body as { events?: unknown } | null)?.events;
  if (!Array.isArray(events)) return null;
  let expires: string | null = null;
  let registrar: string | null = null;
  for (const e of events as { eventAction?: unknown; eventDate?: unknown; eventActor?: unknown }[]) {
    const action = typeof e?.eventAction === "string" ? e.eventAction.toLowerCase() : "";
    if (action === "expiration" && typeof e.eventDate === "string") {
      const at = Date.parse(e.eventDate);
      if (Number.isFinite(at)) expires = istDay(at);
    }
    if (action === "registration" && typeof e.eventActor === "string") registrar = e.eventActor;
  }
  return expires ? { expires, registrar } : null;
}

// ---- Google Maps Platform, India pricing (docs/costs.md) ----

// Billable SKUs Uplink might call, with the free events a month and the first tier's price per 1,000
// (USD, charged in INR at Google's rate). The first tier runs to 5,000,000 a month, far past Uplink's use.
export const GOOGLE_SKUS = {
  geocoding: { name: "Geocoding", free: 70_000, per1000: 1.5 },
  placeDetailsEssentials: { name: "Place Details Essentials", free: 70_000, per1000: 1.5 },
  placeDetailsPro: { name: "Place Details Pro", free: 35_000, per1000: 5.1 },
  textSearchPro: { name: "Text Search Pro", free: 35_000, per1000: 9.6 },
  nearbySearchPro: { name: "Nearby Search Pro", free: 35_000, per1000: 9.6 },
  placeDetailsEnterprise: { name: "Place Details Enterprise", free: 7_000, per1000: 6.0 },
  textSearchEnterprise: { name: "Text Search Enterprise", free: 7_000, per1000: 10.5 },
  autocomplete: { name: "Autocomplete", free: 70_000, per1000: 0.85 },
  idsOnly: { name: "IDs only", free: Infinity, per1000: 0 },
} as const;

export type GoogleSku = keyof typeof GOOGLE_SKUS;
export type GoogleCounts = Partial<Record<GoogleSku, number>>;

// This month's estimate in USD: each SKU's calls past its free allowance, at its price.
export function googleEstimate(counts: GoogleCounts): number {
  let total = 0;
  for (const [sku, count] of Object.entries(counts) as [GoogleSku, number][]) {
    const price = GOOGLE_SKUS[sku];
    if (!price || !Number.isFinite(count) || count <= 0) continue;
    total += (Math.max(0, count - price.free) / 1000) * price.per1000;
  }
  return total;
}

// Tesla Fleet API: a $10 monthly discount, with billing cycles starting on the 1st of the month.
export const TESLA_MONTHLY_CREDIT_USD = CREDIT_USD;

// ---- What a usage-billed row is made of ----

// One line of a row's breakdown. `muted` is words, not a figure.
export type Part = { label: string; value: string; muted?: boolean };

const plural = (n: number, one: string, many: string) => `${formatCount(n)} ${n === 1 ? one : many}`;

export type TeslaParts = {
  kinds: KindCount[];
  signals: number;
  users?: { userId: number; costUsd: number }[];
  budget: { level: BudgetLevel; budgetUsd: number };
};

// Requests per kind, streamed signals, each user's share (user 0: signals from a car no user holds), and
// the check cadence, with the budget when it isn't the credit.
export function teslaParts(t: TeslaParts, now: number): Part[] {
  const budget = t.budget.budgetUsd === CREDIT_USD ? "" : `, budget ${usd(t.budget.budgetUsd)}`;
  return [
    ...t.kinds.map((k) => ({ label: KIND_NAMES[k.kind as Kind] ?? k.kind, value: plural(k.count, "request", "requests") })),
    // The daily retention cron counts signals, so a month reads 0 until its first run.
    t.signals > 0 ? { label: "Streamed signals", value: formatCount(t.signals) } : { label: "Streamed signals", value: "Counted daily", muted: true },
    ...(t.users ?? []).map((u) => ({ label: u.userId === 0 ? "No user" : `User ${u.userId}`, value: usd(u.costUsd) })),
    { label: "Checks", value: `${checkCadence(t.budget.level, nextReset(now))}${budget}`, muted: true },
  ];
}

// Calls per SKU this month, most first; SKUs with none are left out.
export function googleParts(counts: GoogleCounts): Part[] {
  return (Object.entries(counts) as [GoogleSku, number][])
    .filter(([sku, n]) => sku in GOOGLE_SKUS && n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([sku, n]) => ({ label: GOOGLE_SKUS[sku].name, value: plural(n, "call", "calls") }));
}

// Over budget: past the provider's allowance (Tesla) or the owner's budget (Google).
export function overBudget(line: Pick<CostLine, "amount" | "allowance" | "budget">): boolean {
  if (line.amount === null) return false;
  if (line.allowance !== undefined && line.amount > line.allowance) return true;
  return line.budget !== undefined && line.budget !== null && line.amount > line.budget;
}

// ---- What the owner types in ----

// A form's starting values, as typed. Amounts are in dollars.
export type EntryValues = { name: string; amount: string; period: Period; renewsOn: string; link: string };

// cost_entries' built-in service rows, from when Fly.io, Supabase and the domain were typed in. They're
// read automatically now, so these rows are ignored.
export type FixedService = "fly" | "supabase" | "domain";

const httpsLink = z
  .string()
  .trim()
  .max(500)
  .refine((value) => {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, "Links must start with https://");

const amount = z
  .string()
  .trim()
  .transform((v) => v.replace(/[,$\s]/g, ""))
  .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Enter an amount in dollars, like 12.50"))
  .transform(Number)
  .refine((n) => n <= 9_999_999_999.99, "That amount is too large");

const optional = (s: unknown) => (typeof s === "string" && s.trim() === "" ? undefined : s);

export const entrySchema = z.object({
  name: z.string().trim().min(1, "Give it a name").max(80, "Keep the name under 80 characters"),
  amount,
  currency: z.preprocess((v) => v ?? "USD", z.literal("USD", { error: "Enter amounts in dollars" })),
  period: z.enum(PERIODS),
  renewsOn: z.preprocess(optional, z.string().refine(isDate, "Enter a date").optional()),
  link: z.preprocess(optional, httpsLink.optional()),
});

export type EntryInput = z.infer<typeof entrySchema>;

// A form's fields, checked. The first problem is the message to show.
export function parseEntry(fields: Record<string, unknown>): { ok: true; value: EntryInput } | { ok: false; message: string } {
  const result = entrySchema.safeParse(fields);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, message: result.error.issues[0]?.message ?? "Check the fields." };
}

type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

const budget = z
  .string()
  .trim()
  .transform((v) => v.replace(/[,$\s]/g, ""))
  .pipe(z.string().regex(/^\d+(\.\d{1,4})?$/, "Enter the budget as a number"))
  .transform(Number)
  .refine((n) => n > 0 && n < 100_000, "Enter the budget above 0");

// The Google budget in USD; empty clears it (null).
export function parseBudget(value: unknown): Parsed<number | null> {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) return { ok: true, value: null };
  const result = budget.safeParse(value);
  return result.success ? { ok: true, value: result.data } : { ok: false, message: result.error.issues[0]?.message ?? "Check the fields." };
}

// ---- Alerts ----

export type CostAlert = { id: string; kind: "renewal" | "budget"; text: string };

// "7 Nov 2026" for an IST calendar day.
export const formatDay = (day: string) => formatDate(`${day}T00:00:00+05:30`);

function renewalWords(days: number, day: string): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days, on ${formatDay(day)}`;
}

// Costs renewing within 30 days, soonest first, then services past their credit or budget.
export function costAlerts(lines: CostLine[], now: number): CostAlert[] {
  const renewals = lines
    .filter((l) => renews(l) && l.amount !== null && renewsSoon(l.resetsOn, now))
    .sort((a, b) => a.resetsOn!.localeCompare(b.resetsOn!))
    .map((l) => ({ id: l.id, kind: "renewal" as const, text: `${l.name} renews ${renewalWords(daysUntil(l.resetsOn!, now), l.resetsOn!)}.` }));
  const budgets = lines.filter(overBudget).map((l) => ({
    id: l.id,
    kind: "budget" as const,
    text:
      l.allowance !== undefined && l.amount! > l.allowance
        ? `${l.name} is past its ${usd(l.allowance)} monthly credit.`
        : `${l.name} is over its ${usd(l.budget!)} budget.`,
  }));
  return [...renewals, ...budgets];
}
