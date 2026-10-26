import "server-only";
import { DEMO } from "@/lib/demo";
import { readAllRows, readPages } from "@/lib/paging";
import { demoChargingFees, demoChargingSessions } from "./demo";
import { type Owner, ownerDb } from "./data/owner";
import { fleetGet, TeslaError } from "./tesla";

const DAY = 24 * 60 * 60 * 1000;
const LOOKBACK_DAYS = 120;
const PAGE_SIZE = 50;
const MAX_PAGES = 10; // at most 500 sessions per car per check
// The one-time read of everything Tesla keeps: from before the first Supercharger opened (Sept 2012), up
// to 2,000 sessions, with a short pause between pages to stay well inside Tesla's rate limits.
const BACKFILL_FROM = "2012-01-01T00:00:00.000Z";
const BACKFILL_MAX_PAGES = 40;
const BACKFILL_PAUSE_MS = 250;
const UPSERT_CHUNK = 50; // rows carry Tesla's raw item, so they go in batches

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
  vehicle_vin: string;
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

// Pages through one car's history from startTime. Keyed by session so a session that moves between
// pages is only written once (a single upsert cannot contain the same key twice). No sortBy: Tesla
// rejects "StartDateTime" with a 400, and the order doesn't matter since every page is read.
async function fetchVinHistory(
  owner: Owner,
  vin: string,
  startTime: string,
  limits: { maxPages: number; pauseMs?: number },
): Promise<{ rows: ChargingRow[]; complete: boolean }> {
  const fetchedAt = new Date().toISOString();
  const { items, complete } = await readPages(
    async (pageNo) => {
      const query = new URLSearchParams({ vin, startTime, pageNo: String(pageNo), pageSize: String(PAGE_SIZE) });
      const page = await fleetGet<HistoryPage>(owner, `/api/1/dx/charging/history?${query}`);
      return Array.isArray(page) ? page : Array.isArray(page?.data) ? page.data : [];
    },
    { pageSize: PAGE_SIZE, ...limits },
  );
  const rows = new Map<string, ChargingRow>();
  for (const item of items) {
    const row = toRow(vin, item, fetchedAt);
    if (row) rows.set(row.session_id, row);
  }
  return { rows: [...rows.values()], complete };
}

// Whether this car's full history is stored already, read from the rows themselves (no flag to keep). A
// top-up only writes sessions that started within 120 days of the time it wrote them (fetched_at), and only
// rewrites rows still inside its window; the full read writes old sessions with today's fetched_at, and
// saves nothing unless it reached the last page. So the oldest row having been fetched more than 120 days
// (plus a margin for clock skew) after it started means the full read has run. Before that, a car whose
// history is all recent reads it in full each time, which costs what the top-up would. Delete my data
// empties the table, so a reconnect reads it all again.
const FULL_HISTORY_GAP_MS = (LOOKBACK_DAYS + 2) * DAY;

async function hasFullHistory(owner: Owner, vin: string): Promise<boolean> {
  const { data, error } = await ownerDb(owner)
    .from("charging_sessions")
    .select("started_at, fetched_at")
    .eq("vehicle_vin", vin)
    .order("started_at")
    .limit(1);
  if (error) throw new Error(error.message);
  const oldest = data?.[0];
  return Boolean(oldest && Date.parse(oldest.fetched_at as string) - Date.parse(oldest.started_at as string) > FULL_HISTORY_GAP_MS);
}

// The full read for one car. Saves only when it reached the last page and returns whether it did; a page
// cap or a Tesla error other than auth or a rate limit leaves the car to the top-up for this check.
async function backfillVin(owner: Owner, vin: string): Promise<boolean> {
  try {
    const { rows, complete } = await fetchVinHistory(owner, vin, BACKFILL_FROM, { maxPages: BACKFILL_MAX_PAGES, pauseMs: BACKFILL_PAUSE_MS });
    if (!complete) {
      console.warn(`Charging history for ${vin} runs past ${BACKFILL_MAX_PAGES} pages; reading the last ${LOOKBACK_DAYS} days instead.`);
      return false;
    }
    await saveRows(owner, rows);
    return true;
  } catch (err) {
    // No scope or rate limited: a second request now won't do better, so the check skips this car.
    if (err instanceof TeslaError && [401, 403, 429].includes(err.status)) throw err;
    console.warn(`Full charging history read failed for ${vin}; reading the last ${LOOKBACK_DAYS} days instead:`, (err as Error).message);
    return false;
  }
}

async function saveRows(owner: Owner, rows: ChargingRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const { error } = await ownerDb(owner)
      .from("charging_sessions")
      .upsert(rows.slice(i, i + UPSERT_CHUNK), { onConflict: "session_id" });
    if (error) throw new Error(error.message);
  }
}

// Best effort: called from the poll, so it never throws. A 401/403 means the owner has not granted
// the charging scope yet, which is expected until they sign in again, so it is skipped quietly.
// With backfill (the poll, which holds the check lock), a car whose full history isn't stored yet gets all
// of it, saved only once the last page is read: anything halfway saves nothing, and the next check tries
// again. Every other run, and a full read that didn't finish, reads the last 120 days.
export async function syncChargingHistory(owner: Owner, vins: string[], { backfill = false }: { backfill?: boolean } = {}): Promise<void> {
  if (DEMO) return;
  const windowStart = new Date(Date.now() - LOOKBACK_DAYS * DAY).toISOString();
  for (const vin of vins) {
    try {
      if (backfill && !(await hasFullHistory(owner, vin)) && (await backfillVin(owner, vin))) continue;
      const { rows } = await fetchVinHistory(owner, vin, windowStart, { maxPages: MAX_PAGES });
      await saveRows(owner, rows);
    } catch (err) {
      if (err instanceof TeslaError && (err.status === 401 || err.status === 403)) continue;
      console.warn(`Charging history unavailable for ${vin}:`, (err as Error).message);
    }
  }
}

const MIN_SYNC_GAP_MS = 30 * 60 * 1000;
// This instance's last attempt per user: covers the cases the table can't (no sessions yet, a failed sync).
const lastAttempt = new Map<number, number>();

// For the Stats page: the poll's Supercharger sync, at most once per 30 minutes per user. The time of the
// last sync is the newest fetched_at in the user's charging_sessions (every sync rewrites the rows it
// fetches), so it holds across serverless instances without a settings table; lastAttempt is the
// per-instance backstop.
export async function syncChargingHistoryThrottled(owner: Owner): Promise<void> {
  if (DEMO) return;
  try {
    if (Date.now() - (lastAttempt.get(owner.userId) ?? 0) < MIN_SYNC_GAP_MS) return;
    lastAttempt.set(owner.userId, Date.now());
    const { data: last, error } = await ownerDb(owner).from("charging_sessions").select("fetched_at").order("fetched_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    if (last?.fetched_at && Date.now() - Date.parse(last.fetched_at as string) < MIN_SYNC_GAP_MS) return;
    const { data: cars, error: carsError } = await ownerDb(owner).from("vehicles").select("vin").not("vin", "is", null);
    if (carsError) throw new Error(carsError.message);
    await syncChargingHistory(owner, (cars ?? []).map((c) => c.vin as string));
  } catch (err) {
    console.warn("Charging history sync failed:", (err as Error).message);
  }
}

// One session's fee lines as Tesla sent them (see feeLines for reading them), or null when there are none
// or the read fails. Kept out of the list above, which only needs the totals.
export async function loadChargingFees(owner: Owner, sessionId: string): Promise<unknown> {
  if (DEMO) return demoChargingFees(sessionId);
  const { data, error } = await ownerDb(owner).from("charging_sessions").select("fees").eq("session_id", sessionId).maybeSingle();
  if (error) {
    console.warn("Charging fees unavailable:", error.message);
    return null;
  }
  return data?.fees ?? null;
}

// Every one of the owner's sessions, newest first: All time and each period are worked out from this list. A missing table
// or a read error shows as an empty list, with a log line.
export async function loadChargingSessions(owner: Owner): Promise<ChargingSession[]> {
  if (DEMO) return demoChargingSessions();
  const { data, error } = await readAllRows((from, to) =>
    ownerDb(owner)
      .from("charging_sessions")
      .select("session_id, vehicle_vin, site_name, started_at, stopped_at, energy_kwh, cost_total, currency, invoices")
      .order("started_at", { ascending: false })
      .order("session_id", { ascending: false })
      .range(from, to),
  );
  if (error) {
    console.warn("Charging history unavailable:", error.message);
    return [];
  }
  return data.map((row) => ({
    session_id: row.session_id as string,
    vehicle_vin: row.vehicle_vin as string,
    site_name: (row.site_name as string | null) ?? null,
    started_at: row.started_at as string,
    stopped_at: (row.stopped_at as string | null) ?? null,
    energy_kwh: num(row.energy_kwh),
    cost_total: num(row.cost_total),
    currency: (row.currency as string | null) ?? null,
    invoices: Array.isArray(row.invoices) ? (row.invoices as ChargingInvoice[]) : [],
  }));
}
