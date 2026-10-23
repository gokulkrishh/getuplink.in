import "server-only";
import { createHash } from "node:crypto";
import { type Invoice, invoiceProblem, matchInvoice, pickedSessionFits, type ReceiptSession } from "@/lib/charge-receipts";
import { loadDrivingFigures } from "./driving";
import { selectSessions, toStreamSession } from "./stream-charging";
import { DEMO } from "@/lib/demo";
import { db } from "./supabase";
import { loadPrimaryVehicle } from "./telemetry";

// What the MCP connector (app/api/mcp) reads and writes. Each function returns plain data the tools
// hand back to the AI as JSON.

const DAY = 86_400_000;
const IST_MS = 5.5 * 60 * 60 * 1000;
export const INVOICE_BUCKET = "charge-invoices";
const MAX_FILE_BYTES = 3 * 1024 * 1024;

// "2026-10-21T19:10:00+05:30": IST, the way invoices print times.
export function istIso(value: string | number): string {
  const ms = typeof value === "number" ? value : Date.parse(value);
  return new Date(ms + IST_MS).toISOString().replace(/\.\d{3}Z$/, "+05:30");
}

// A time from the AI: with an offset or Z as given, without one as IST wall-clock time.
export function parseInvoiceTime(value: string): number {
  return Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}+05:30`);
}

type ReceiptRow = {
  session_id: number;
  network: string;
  amount_total: number;
  gst: number | null;
  kwh_billed: number | null;
  invoice_number: string | null;
  invoice_path: string | null;
};

async function receiptsFor(ids: number[]): Promise<Map<number, ReceiptRow>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await db().from("charge_receipts").select("session_id, network, amount_total, gst, kwh_billed, invoice_number, invoice_path").in("session_id", ids);
  if (error) throw new Error(`Reading invoices failed: ${error.message}`);
  return new Map((data as ReceiptRow[]).map((r) => [Number(r.session_id), r]));
}

async function sessionsBetween(from: number, to: number): Promise<ReceiptSession[]> {
  const { data, error } = await selectSessions((columns) =>
    db().from("stream_charge_sessions").select(columns).gte("started_at", new Date(from).toISOString()).lt("started_at", new Date(to).toISOString()).order("started_at", { ascending: false }).limit(200),
  );
  if (error) throw new Error(`Reading sessions failed: ${error.message}`);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(toStreamSession);
}

function describe(s: ReceiptSession, receipt: ReceiptRow | undefined) {
  return {
    session_id: s.id,
    started_at: istIso(s.started_at),
    ended_at: s.ended_at ? istIso(s.ended_at) : null,
    charging: s.ended_at == null,
    type: s.supercharger ? "Supercharger" : s.kind.toUpperCase(),
    kwh_added: s.energy_added_kwh,
    station: s.station_name,
    invoice: receipt
      ? { network: receipt.network, amount_total: Number(receipt.amount_total), gst: receipt.gst == null ? null : Number(receipt.gst), kwh_billed: receipt.kwh_billed == null ? null : Number(receipt.kwh_billed) }
      : null,
  };
}

export async function listChargingSessions({ from, to, withoutInvoice }: { from?: string; to?: string; withoutInvoice?: boolean }) {
  const end = to ? parseInvoiceTime(to) : Date.now();
  const start = from ? parseInvoiceTime(from) : end - 30 * DAY;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { error: "from and to must be dates like 2026-10-21 or 2026-10-21T19:10." };
  const sessions = await sessionsBetween(start, end + DAY);
  const receipts = await receiptsFor(sessions.map((s) => s.id));
  const listed = sessions
    .filter((s) => !withoutInvoice || (!s.supercharger && s.ended_at != null && !receipts.has(s.id)))
    .map((s) => describe(s, receipts.get(s.id)));
  return { sessions: listed, note: "Supercharger sessions are billed by Tesla and need no invoice." };
}

export type AttachInput = {
  network: string;
  station?: string;
  started_at: string;
  ended_at?: string;
  kwh_billed?: number;
  amount_total: number;
  gst?: number;
  currency?: string;
  invoice_number?: string;
  source_ref?: string;
  session_id?: number;
  replace?: boolean;
  file_base64?: string;
};

// The file's type from its first bytes, never from a name the AI gives it.
function sniff(bytes: Buffer): { type: string; ext: string } | null {
  if (bytes.subarray(0, 4).toString("latin1") === "%PDF") return { type: "application/pdf", ext: "pdf" };
  if (bytes[0] === 0x89 && bytes.subarray(1, 4).toString("latin1") === "PNG") return { type: "image/png", ext: "png" };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  return null;
}

export async function attachInvoice(input: AttachInput) {
  const now = Date.now();
  const startedAt = parseInvoiceTime(input.started_at);
  const endedAt = input.ended_at ? parseInvoiceTime(input.ended_at) : null;
  const invoice: Invoice = {
    network: input.network.trim(),
    station: input.station ?? null,
    startedAt,
    endedAt: endedAt != null && Number.isFinite(endedAt) ? endedAt : null,
    kwhBilled: input.kwh_billed ?? null,
    amountTotal: input.amount_total,
    gst: input.gst ?? null,
  };
  const problem = invoiceProblem(invoice, now);
  if (problem) return { status: "rejected", reason: problem };
  if ((input.currency ?? "INR").toUpperCase() !== "INR") return { status: "rejected", reason: "Only invoices in INR are supported." };

  // Seen before: the scheduled run sees the same emails every 6 hours.
  const seen = input.source_ref
    ? await db().from("charge_receipts").select("session_id").eq("source_ref", input.source_ref).maybeSingle()
    : input.invoice_number
      ? await db().from("charge_receipts").select("session_id").ilike("network", invoice.network).eq("invoice_number", input.invoice_number).maybeSingle()
      : { data: null, error: null };
  if (seen.error) throw new Error(`Reading invoices failed: ${seen.error.message}`);
  if (seen.data) return { status: "already_attached", session_id: Number(seen.data.session_id) };

  let file: { bytes: Buffer; type: string; ext: string } | null = null;
  if (input.file_base64) {
    const bytes = Buffer.from(input.file_base64.replace(/^data:[^,]*,/, ""), "base64");
    if (bytes.length > MAX_FILE_BYTES) return { status: "rejected", reason: "The file is over 3 MB." };
    const kind = sniff(bytes);
    if (!kind) return { status: "rejected", reason: "The file isn't a PDF, PNG or JPEG." };
    file = { bytes, ...kind };
  }

  const nearby = await sessionsBetween(startedAt - DAY, startedAt + DAY);
  let session: ReceiptSession;
  if (input.session_id != null) {
    const picked = nearby.find((s) => s.id === input.session_id);
    if (!picked || !pickedSessionFits(invoice, picked)) {
      return { status: "rejected", reason: "That session doesn't fit this invoice: it has to be a finished non-Supercharger session within 2 hours of the invoice, with similar kWh." };
    }
    session = picked;
  } else {
    const result = matchInvoice(invoice, nearby);
    if (result.kind === "none") {
      return { status: "no_session", reason: "No finished session matches yet. If the charge just ended, try again on the next run." };
    }
    if (result.kind === "ambiguous") {
      const receipts = await receiptsFor(result.candidates.map((s) => s.id));
      return { status: "candidates", reason: "More than one session fits. Ask the owner which one, then call again with session_id.", candidates: result.candidates.map((s) => describe(s, receipts.get(s.id))) };
    }
    session = result.session;
  }

  const existing = (await receiptsFor([session.id])).get(session.id);
  if (existing && !input.replace) {
    return { status: "session_has_invoice", reason: "This session already has an invoice. Call again with replace: true only if the owner says so.", session: describe(session, existing) };
  }

  let invoicePath: string | null = existing?.invoice_path ?? null;
  if (file) {
    const digest = createHash("sha256").update(file.bytes).digest("hex").slice(0, 16);
    invoicePath = `${session.id}/${digest}.${file.ext}`;
    const { error } = await db().storage.from(INVOICE_BUCKET).upload(invoicePath, file.bytes, { contentType: file.type, upsert: true });
    if (error) throw new Error(`Saving the invoice file failed: ${error.message}`);
  }

  const row = {
    session_id: session.id,
    network: invoice.network,
    station: input.station ?? null,
    started_at: new Date(startedAt).toISOString(),
    ended_at: invoice.endedAt == null ? null : new Date(invoice.endedAt).toISOString(),
    kwh_billed: invoice.kwhBilled,
    amount_total: invoice.amountTotal,
    gst: invoice.gst,
    currency: "INR",
    invoice_path: invoicePath,
    invoice_number: input.invoice_number ?? null,
    source_ref: input.source_ref ?? null,
    source: input.source_ref?.startsWith("gmail:") ? "gmail" : "chat",
    added_at: new Date(now).toISOString(),
  };
  const { error } = await db().from("charge_receipts").upsert(row, { onConflict: "session_id" });
  if (error) {
    // Unique source_ref or invoice number: another call saved it a moment ago.
    if (error.code === "23505") return { status: "already_attached", session_id: session.id };
    throw new Error(`Saving the invoice failed: ${error.message}`);
  }
  if (existing?.invoice_path && existing.invoice_path !== invoicePath) {
    await db().storage.from(INVOICE_BUCKET).remove([existing.invoice_path]);
  }
  return { status: "attached", session: describe(session, { ...row, gst: row.gst ?? null, kwh_billed: row.kwh_billed ?? null }) };
}

const monthOf = (iso: string) => istIso(iso).slice(0, 7);

// Spend and energy per IST month, from real bills only: Tesla's for Superchargers, invoices for the rest.
export async function chargingSummary(months: number) {
  const now = new Date(Date.now() + IST_MS);
  const since = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1) - IST_MS;
  const [tesla, sessions] = await Promise.all([
    db().from("charging_sessions").select("started_at, energy_kwh, cost_total").gte("started_at", new Date(since).toISOString()),
    sessionsBetween(since, Date.now() + DAY),
  ]);
  if (tesla.error && !["42P01", "PGRST205"].includes(tesla.error.code)) throw new Error(`Reading Supercharger sessions failed: ${tesla.error.message}`);
  const others = sessions.filter((s) => !s.supercharger && s.ended_at != null);
  const receipts = await receiptsFor(others.map((s) => s.id));

  type Month = {
    supercharger: { sessions: number; kwh: number; spend_inr: number };
    other: { sessions: number; kwh_added: number; with_invoice: number; spend_inr: number; by_network: Record<string, { sessions: number; spend_inr: number; kwh_billed: number }> };
  };
  const out: Record<string, Month> = {};
  const month = (key: string) =>
    (out[key] ??= { supercharger: { sessions: 0, kwh: 0, spend_inr: 0 }, other: { sessions: 0, kwh_added: 0, with_invoice: 0, spend_inr: 0, by_network: {} } });
  for (const t of (tesla.data ?? []) as { started_at: string; energy_kwh: number | null; cost_total: number | null }[]) {
    const m = month(monthOf(t.started_at)).supercharger;
    m.sessions += 1;
    m.kwh += Number(t.energy_kwh ?? 0);
    m.spend_inr += Number(t.cost_total ?? 0);
  }
  for (const s of others) {
    const m = month(monthOf(s.started_at)).other;
    m.sessions += 1;
    m.kwh_added += s.energy_added_kwh ?? 0;
    const r = receipts.get(s.id);
    if (!r) continue;
    m.with_invoice += 1;
    m.spend_inr += Number(r.amount_total);
    const n = (m.by_network[r.network] ??= { sessions: 0, spend_inr: 0, kwh_billed: 0 });
    n.sessions += 1;
    n.spend_inr += Number(r.amount_total);
    n.kwh_billed += Number(r.kwh_billed ?? 0);
  }
  return {
    months: out,
    note: "Spend counts real bills only. Non-Supercharger sessions without an invoice (home charging, networks that didn't send one) have no cost: other.sessions minus other.with_invoice.",
  };
}

export async function drivingSummary() {
  const vin = (await loadPrimaryVehicle())?.vin ?? null;
  const figures = await loadDrivingFigures(vin, Date.now());
  const periods = Object.fromEntries(
    Object.entries(figures.periods).map(([period, p]) => [
      period,
      { km: p.current.km, wh_per_km: p.current.whPerKm, regen_kwh: p.current.regenKwh, previous_km: p.previous?.km ?? null },
    ]),
  );
  return {
    periods,
    odometer_km: figures.odometerKm,
    tracking_since: figures.since ? istIso(figures.since) : null,
    note: "week, month and year are the current calendar week, month and year in IST, so far.",
  };
}

// The invoice amount for each of these sessions that has one, for Charging stats. Never fails the page:
// a read error (or a database without the table yet) shows as no invoices.
export async function invoicesBySession(ids: number[]): Promise<Map<number, { amount: number; kwhBilled: number | null; network: string }>> {
  if (DEMO || ids.length === 0) return new Map();
  try {
    const rows = await receiptsFor(ids);
    return new Map([...rows].map(([id, r]) => [id, { amount: Number(r.amount_total), kwhBilled: r.kwh_billed == null ? null : Number(r.kwh_billed), network: r.network }]));
  } catch (err) {
    if (!/charge_receipts/.test(String(err))) console.warn("Invoices unavailable:", (err as Error).message);
    return new Map();
  }
}

export type SessionInvoice = { network: string; amountTotal: number; gst: number | null; kwhBilled: number | null; hasFile: boolean };

// The invoice attached to one session, for its page. Never fails the page: a read error (or a
// database without the table yet) shows as no invoice.
export async function sessionInvoice(sessionId: number): Promise<SessionInvoice | null> {
  const { data, error } = await db().from("charge_receipts").select("network, amount_total, gst, kwh_billed, invoice_path").eq("session_id", sessionId).maybeSingle();
  if (error) {
    if (!["42P01", "PGRST205"].includes(error.code)) console.warn("Invoice unavailable:", error.message);
    return null;
  }
  if (!data) return null;
  return {
    network: data.network as string,
    amountTotal: Number(data.amount_total),
    gst: data.gst == null ? null : Number(data.gst),
    kwhBilled: data.kwh_billed == null ? null : Number(data.kwh_billed),
    hasFile: Boolean(data.invoice_path),
  };
}

// For the owner-only invoice route: the stored file of one session's invoice.
export async function invoiceFile(sessionId: number): Promise<{ body: Blob; type: string } | null> {
  const { data, error } = await db().from("charge_receipts").select("invoice_path").eq("session_id", sessionId).maybeSingle();
  if (error || !data?.invoice_path) return null;
  const file = await db().storage.from(INVOICE_BUCKET).download(data.invoice_path as string);
  if (file.error || !file.data) return null;
  return { body: file.data, type: file.data.type || "application/octet-stream" };
}

// Delete my data: the invoices and their files, before the sessions they point at.
export async function deleteAllInvoices(): Promise<void> {
  const { data, error } = await db().from("charge_receipts").select("invoice_path");
  if (error) {
    if (["42P01", "PGRST205"].includes(error.code)) return;
    throw new Error(`Reading invoices failed: ${error.message}`);
  }
  const paths = (data as { invoice_path: string | null }[]).map((r) => r.invoice_path).filter((p): p is string => Boolean(p));
  if (paths.length) await db().storage.from(INVOICE_BUCKET).remove(paths);
  const { error: deleteError } = await db().from("charge_receipts").delete().not("session_id", "is", null);
  if (deleteError) throw new Error(`Deleting invoices failed: ${deleteError.message}`);
}
