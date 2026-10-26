import { z } from "zod";
import { formatDate, formatMoney } from "@/lib/format";
import { istDay } from "@/lib/status";
import { CREDIT_USD } from "@/lib/tesla-billing";

// What running Uplink costs, without the network or the database: the shape every provider returns, the
// currency and period maths, renewals, the Google and Tesla estimates, and the checks on what the owner
// types in. Sources and prices are recorded in docs/costs.md.

export const CURRENCIES = ["INR", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const PERIODS = ["monthly", "yearly"] as const;
export type Period = (typeof PERIODS)[number];
export type Source = "live" | "estimated" | "fixed";

// Why a line has no amount, or why its amount is old.
export type CostState =
  | "ok"
  | "stale" // the live call failed; amount is the last value read, at `asOf`
  | "connect" // a token isn't set; no figure
  | "unavailable" // the live call failed and nothing was read before
  | "not-tracked" // the usage counter isn't wired yet
  | "not-set"; // a fixed entry the owner hasn't entered

// One service's cost this period. `amount` is in `currency`; for a yearly line it is the whole year.
// `allowance` is a credit the provider takes off before charging (Tesla's monthly $10): the line charges
// what's left. `budget` is the owner's own limit (Google). Both are in `currency`.
export type CostLine = {
  id: string;
  name: string;
  amount: number | null;
  currency: Currency;
  period: Period;
  resetsOn: string | null; // YYYY-MM-DD: when the period resets or the entry renews
  source: Source;
  link: string;
  state: CostState;
  note?: string;
  asOf?: string; // ISO time the amount was read, for a stale live value
  allowance?: number;
  budget?: number | null;
};

export const DEFAULT_USD_INR = 84;

// USD_INR: rupees to a dollar. Unset or not a positive number is the default.
export function parseRate(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) return null;
  const n = Number(typeof value === "string" ? value.trim() : value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function toInr(amount: number, currency: Currency, rate: number): number {
  return currency === "INR" ? amount : amount * rate;
}

// What the line adds to this month: a yearly cost counts as a twelfth, and an allowance comes off first.
export function monthlyCharge(line: Pick<CostLine, "amount" | "period" | "allowance">): number | null {
  if (line.amount === null) return null;
  const charged = Math.max(0, line.amount - (line.allowance ?? 0));
  return line.period === "yearly" ? charged / 12 : charged;
}

export type Total = { inr: number; usd: number; counted: number; uncounted: number; yearly: number };

// The month's total, from the lines themselves. A line with no amount adds nothing and is counted as left
// out, so the header can say the total isn't complete.
export function monthlyTotal(lines: CostLine[], rate: number): Total {
  let inr = 0;
  let counted = 0;
  let yearly = 0;
  for (const line of lines) {
    const share = monthlyCharge(line);
    if (share === null) continue;
    inr += toInr(share, line.currency, rate);
    counted++;
    if (line.period === "yearly") yearly++;
  }
  return { inr, usd: inr / rate, counted, uncounted: lines.length - counted, yearly };
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
  let usd = 0;
  for (const [sku, count] of Object.entries(counts) as [GoogleSku, number][]) {
    const price = GOOGLE_SKUS[sku];
    if (!price || !Number.isFinite(count) || count <= 0) continue;
    usd += (Math.max(0, count - price.free) / 1000) * price.per1000;
  }
  return usd;
}

// Tesla Fleet API: a $10 monthly discount, with billing cycles starting on the 1st of the month.
export const TESLA_MONTHLY_CREDIT_USD = CREDIT_USD;

// Over budget: past the provider's allowance (Tesla) or the owner's budget (Google).
export function overBudget(line: Pick<CostLine, "amount" | "allowance" | "budget">): boolean {
  if (line.amount === null) return false;
  if (line.allowance !== undefined && line.amount > line.allowance) return true;
  return line.budget !== undefined && line.budget !== null && line.amount > line.budget;
}

// ---- What the owner types in ----

// A form's starting values, as typed.
export type EntryValues = { name: string; amount: string; currency: Currency; period: Period; renewsOn: string; link: string };

// Built-in fixed entries, one each. Other rows have no service.
export const FIXED_SERVICES = {
  fly: { name: "Fly.io", period: "monthly", link: "https://fly.io/dashboard/personal/billing" },
  supabase: { name: "Supabase", period: "monthly", link: "https://supabase.com/dashboard/org/_/billing" },
  domain: { name: "Domain", period: "yearly", link: "https://ap.www.namecheap.com/domains/list/" },
} as const satisfies Record<string, { name: string; period: Period; link: string }>;

export type FixedService = keyof typeof FIXED_SERVICES;

export function isFixedService(value: unknown): value is FixedService {
  return typeof value === "string" && Object.hasOwn(FIXED_SERVICES, value);
}

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
  .transform((v) => v.replace(/[,₹$\s]/g, ""))
  .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Enter an amount, like 1200 or 12.50"))
  .transform(Number)
  .refine((n) => n <= 9_999_999_999.99, "That amount is too large");

const optional = (s: unknown) => (typeof s === "string" && s.trim() === "" ? undefined : s);

export const entrySchema = z.object({
  name: z.string().trim().min(1, "Give it a name").max(80, "Keep the name under 80 characters"),
  amount,
  currency: z.enum(CURRENCIES),
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

const positive = (label: string) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/[,₹$\s]/g, ""))
    .pipe(z.string().regex(/^\d+(\.\d{1,4})?$/, `Enter ${label} as a number`))
    .transform(Number)
    .refine((n) => n > 0 && n < 100_000, `Enter ${label} above 0`);

type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

const first = (issues: { message: string }[]) => issues[0]?.message ?? "Check the fields.";

// The rate typed on the page: rupees to a dollar.
export function parseRateInput(value: unknown): Parsed<number> {
  const result = positive("the rate").safeParse(value ?? "");
  return result.success ? { ok: true, value: result.data } : { ok: false, message: first(result.error.issues) };
}

// The Google budget in USD; empty clears it (null).
export function parseBudget(value: unknown): Parsed<number | null> {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) return { ok: true, value: null };
  const result = positive("the budget").safeParse(value);
  return result.success ? { ok: true, value: result.data } : { ok: false, message: first(result.error.issues) };
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

// Fixed costs renewing within 30 days, soonest first, then services past their credit or budget.
export function costAlerts(lines: CostLine[], now: number): CostAlert[] {
  const renewals = lines
    .filter((l) => l.source === "fixed" && l.state === "ok" && renewsSoon(l.resetsOn, now))
    .sort((a, b) => a.resetsOn!.localeCompare(b.resetsOn!))
    .map((l) => ({ id: l.id, kind: "renewal" as const, text: `${l.name} renews ${renewalWords(daysUntil(l.resetsOn!, now), l.resetsOn!)}.` }));
  const budgets = lines.filter(overBudget).map((l) => ({
    id: l.id,
    kind: "budget" as const,
    text:
      l.allowance !== undefined && l.amount! > l.allowance
        ? `${l.name} is past its ${formatMoney(l.allowance, l.currency)} monthly credit.`
        : `${l.name} is over its ${formatMoney(l.budget!, l.currency)} budget.`,
  }));
  return [...renewals, ...budgets];
}
