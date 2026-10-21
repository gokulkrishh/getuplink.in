import "server-only";
import { DEMO } from "@/lib/demo";
import { db } from "./supabase";
import { fleetGet, TeslaError } from "./tesla";

const DAY = 24 * 60 * 60 * 1000;
const LOOKBACK_DAYS = 120;
const PAGE_SIZE = 50;
const MAX_PAGES = 10; // at most 500 sessions per car per check
const LIST_LIMIT = 200;

// Tesla documents the charging history loosely, so every field is optional and read defensively.
type Fee = {
  feeType?: string;
  currencyCode?: string;
  usageBase?: number | string;
  totalDue?: number | string;
  uom?: string;
};

type Invoice = { fileName?: string; contentId?: string; invoiceType?: string };

type HistoryItem = {
  sessionId?: string | number;
  siteLocationName?: string;
  chargeStartDateTime?: string;
  chargeStopDateTime?: string;
  fees?: Fee[];
  invoices?: Invoice[];
};

type HistoryPage = { data?: HistoryItem[] } | HistoryItem[];

export type ChargingInvoice = { fileName: string | null; contentId: string | null; invoiceType: string | null };

export type ChargingSession = {
  session_id: string;
  site_name: string | null;
  started_at: string;
  stopped_at: string | null;
  energy_kwh: number | null;
  cost_total: number | null;
  currency: string | null;
  invoices: ChargingInvoice[];
};

type ChargingRow = {
  session_id: string;
  vehicle_vin: string;
  site_name: string | null;
  started_at: string;
  stopped_at: string | null;
  energy_kwh: number | null;
  cost_total: number | null;
  currency: string | null;
  fees: Fee[];
  invoices: Invoice[];
  raw: HistoryItem;
  fetched_at: string;
};

// Numbers can arrive as strings (Tesla, and Postgres numeric columns through PostgREST).
function num(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function isoOrNull(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toRow(vin: string, item: HistoryItem, fetchedAt: string): ChargingRow | null {
  const started = isoOrNull(item.chargeStartDateTime);
  if (item.sessionId === undefined || item.sessionId === null || !started) return null;
  const fees = Array.isArray(item.fees) ? item.fees : [];
  // Energy is the CHARGING line's usage in kWh; cost is every fee line's total.
  const charging = fees.find((f) => f.feeType?.toUpperCase() === "CHARGING" && f.uom?.toLowerCase() === "kwh");
  const totals = fees.map((f) => num(f.totalDue)).filter((n): n is number => n !== null);
  return {
    session_id: String(item.sessionId),
    vehicle_vin: vin,
    site_name: item.siteLocationName ?? null,
    started_at: started,
    stopped_at: isoOrNull(item.chargeStopDateTime),
    energy_kwh: num(charging?.usageBase),
    cost_total: totals.length ? totals.reduce((sum, n) => sum + n, 0) : null,
    currency: fees.find((f) => f.currencyCode)?.currencyCode ?? null,
    fees,
    invoices: Array.isArray(item.invoices) ? item.invoices : [],
    raw: item,
    fetched_at: fetchedAt,
  };
}

// Pages through the last 120 days for one car. Keyed by session so a session that moves between
// pages is only written once (a single upsert cannot contain the same key twice).
async function fetchVinHistory(vin: string, startTime: string): Promise<ChargingRow[]> {
  const fetchedAt = new Date().toISOString();
  const rows = new Map<string, ChargingRow>();
  for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo++) {
    const query = new URLSearchParams({
      vin,
      startTime,
      pageNo: String(pageNo),
      pageSize: String(PAGE_SIZE),
      sortBy: "StartDateTime",
      sortOrder: "DESC",
    });
    const page = await fleetGet<HistoryPage>(`/api/1/dx/charging/history?${query}`);
    const items = Array.isArray(page) ? page : Array.isArray(page?.data) ? page.data : [];
    for (const item of items) {
      const row = toRow(vin, item, fetchedAt);
      if (row) rows.set(row.session_id, row);
    }
    if (items.length < PAGE_SIZE) break;
  }
  return [...rows.values()];
}

// Best effort: called from the poll, so it never throws. A 401/403 means the owner has not granted
// the charging scope yet, which is expected until they sign in again, so it is skipped quietly.
export async function syncChargingHistory(vins: string[]): Promise<void> {
  const startTime = new Date(Date.now() - LOOKBACK_DAYS * DAY).toISOString();
  for (const vin of vins) {
    try {
      const rows = await fetchVinHistory(vin, startTime);
      if (rows.length === 0) continue;
      const { error } = await db().from("charging_sessions").upsert(rows, { onConflict: "session_id" });
      if (error) throw new Error(error.message);
    } catch (err) {
      if (err instanceof TeslaError && (err.status === 401 || err.status === 403)) continue;
      console.warn(`Charging history unavailable for ${vin}:`, (err as Error).message);
    }
  }
}

// Newest first. A missing table or a read error shows as an empty list, with a log line.
export async function loadChargingSessions(): Promise<ChargingSession[]> {
  if (DEMO) return demoSessions();
  const { data, error } = await db()
    .from("charging_sessions")
    .select("session_id, site_name, started_at, stopped_at, energy_kwh, cost_total, currency, invoices")
    .order("started_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (error) {
    console.warn("Charging history unavailable:", error.message);
    return [];
  }
  return (data ?? []).map((row) => ({
    session_id: row.session_id as string,
    site_name: (row.site_name as string | null) ?? null,
    started_at: row.started_at as string,
    stopped_at: (row.stopped_at as string | null) ?? null,
    energy_kwh: num(row.energy_kwh),
    cost_total: num(row.cost_total),
    currency: (row.currency as string | null) ?? null,
    invoices: Array.isArray(row.invoices) ? (row.invoices as ChargingInvoice[]) : [],
  }));
}

// Demo sessions modelled on real data: India's open Supercharger sites (Mumbai BKC and Navi Mumbai
// Nexus Seawoods, V4 up to 250 kW), Tesla India's ₹24/kWh rate, and the fee shape of a real
// charging-history reply (a CHARGING line priced per kWh). Dated relative to now, across two months.
const DEMO_RATE_INR = 24;
function demoSessions(): ChargingSession[] {
  const now = Date.now();
  const BKC = "Mumbai, Bandra Kurla Complex";
  const SEAWOODS = "Navi Mumbai, Nexus Seawoods";
  const sample: { site: string; daysAgo: number; kwh: number; invoice: boolean }[] = [
    { site: BKC, daysAgo: 2, kwh: 38.6, invoice: true },
    { site: SEAWOODS, daysAgo: 6, kwh: 24.1, invoice: true },
    { site: BKC, daysAgo: 9, kwh: 41.3, invoice: true },
    { site: BKC, daysAgo: 11, kwh: 18.2, invoice: true },
    { site: SEAWOODS, daysAgo: 13, kwh: 33.7, invoice: true },
    { site: BKC, daysAgo: 15, kwh: 22.9, invoice: true },
    { site: SEAWOODS, daysAgo: 17, kwh: 29.4, invoice: true },
    { site: BKC, daysAgo: 25, kwh: 27.8, invoice: true },
    { site: SEAWOODS, daysAgo: 29, kwh: 20.4, invoice: true },
    { site: BKC, daysAgo: 33, kwh: 45.0, invoice: true },
  ];
  return sample.map((s, i) => {
    const started = new Date(now - s.daysAgo * DAY);
    // About 70 kW average on a V4 stall.
    const minutes = Math.round((s.kwh / 70) * 60);
    return {
      session_id: `demo-${i + 1}`,
      site_name: s.site,
      started_at: started.toISOString(),
      stopped_at: new Date(started.getTime() + minutes * 60 * 1000).toISOString(),
      energy_kwh: s.kwh,
      cost_total: Math.round(s.kwh * DEMO_RATE_INR * 100) / 100,
      currency: "INR",
      invoices: s.invoice ? [{ fileName: "invoice.pdf", contentId: `demo-invoice-${i + 1}`, invoiceType: "CHARGING" }] : [],
    };
  });
}
