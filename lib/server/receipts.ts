import { type InvoiceDetail, keptDetails, storedDetails } from "@/lib/invoice-details";
import "server-only";
import { parseInvoiceTime, parseRangeEnd } from "@/lib/mcp-ranges";
import { createHash } from "node:crypto";
import { type Invoice, invoiceProblem, matchInvoice, pickedSessionFits, type ReceiptSession } from "@/lib/charge-receipts";
import { type InvoiceLine, reconcile, type SentLine, type StoredItems, storedLines } from "@/lib/invoice-items";
import { loadDrivingFigures } from "./driving";
import { selectSessions, toStreamSession } from "./stream-charging";
import { DEMO } from "@/lib/demo";
import { readAllRows } from "@/lib/paging";
import { type Owner, ownerDb, showsInvoices } from "./data/owner";
import { loadPrimaryVehicle } from "./telemetry";

// What the MCP connector (app/api/mcp) reads and writes. Each function returns plain data the tools
// hand back to the AI as JSON.

const DAY = 86_400_000;
const IST_MS = 5.5 * 60 * 60 * 1000;
const MAX_FILE_BYTES = 3 * 1024 * 1024;

// "2026-10-21T19:10:00+05:30": IST, the way invoices print times.
export function istIso(value: string | number): string {
  const ms = typeof value === "number" ? value : Date.parse(value);
  return new Date(ms + IST_MS).toISOString().replace(/\.\d{3}Z$/, "+05:30");
}

type ReceiptRow = {
  session_id: number;
  network: string;
  station: string | null;
  amount_total: number;
  gst: number | null;
  energy_amount?: number | null;
  kwh_billed: number | null;
  invoice_number: string | null;
  invoice_path: string | null;
};

// The ids go in the URL, so a long list is read in chunks.
const IDS_PER_READ = 200;

const RECEIPT_COLUMNS = "session_id, network, station, amount_total, gst, kwh_billed, invoice_number, invoice_path";
// energy_amount comes with migration 20261103160000; until it's applied, reads leave it out (Postgres
// answers 42703, undefined column) and writes only send it when there is one.
const ENERGY = "energy_amount";
const noEnergyColumn = (error: { code?: string } | null) => error?.code === "42703";
const amount = (n: unknown) => (n == null ? null : Number(n));

async function receiptsFor(owner: Owner, ids: number[]): Promise<Map<number, ReceiptRow>> {
  const out = new Map<number, ReceiptRow>();
  for (let i = 0; i < ids.length; i += IDS_PER_READ) {
    const read = (columns: string) => ownerDb(owner).from("charge_receipts").select(columns).in("session_id", ids.slice(i, i + IDS_PER_READ));
    let { data, error } = await read(`${RECEIPT_COLUMNS}, ${ENERGY}`);
    if (noEnergyColumn(error)) ({ data, error } = await read(RECEIPT_COLUMNS));
    if (error) throw new Error(`Reading invoices failed: ${error.message}`);
    for (const r of data as unknown as ReceiptRow[]) out.set(Number(r.session_id), r);
  }
  return out;
}

// The invoices' own lines, where they were sent and still add up (lib/invoice-items.ts storedLines), in a
// read of their own: before migration 20261104120000 the column is missing (42703) and every other figure
// still reads. Never fails: an invoice without lines shows Before GST and GST.
async function linesFor(owner: Owner, ids: number[]): Promise<Map<number, InvoiceLine[]>> {
  const out = new Map<number, InvoiceLine[]>();
  for (let i = 0; i < ids.length; i += IDS_PER_READ) {
    const { data, error } = await ownerDb(owner)
      .from("charge_receipts")
      .select("session_id, invoice_path, amount_total, line_items")
      .in("session_id", ids.slice(i, i + IDS_PER_READ))
      .not("line_items", "is", null);
    if (error) {
      if (error.code !== "42703") console.warn("Invoice lines unavailable:", error.message);
      return out;
    }
    for (const r of data as { session_id: number; invoice_path: string | null; amount_total: number; line_items: unknown }[]) {
      const lines = storedLines(r.line_items, { invoicePath: r.invoice_path, amountTotal: Number(r.amount_total) });
      if (lines) out.set(Number(r.session_id), lines);
    }
  }
  return out;
}

// Newest first: the latest 200 for listing and matching, or with `all` every one, for the summary.
async function sessionsBetween(owner: Owner, from: number, to: number, { all = false }: { all?: boolean } = {}): Promise<ReceiptSession[]> {
  const query = (columns: string) =>
    ownerDb(owner)
      .from("stream_charge_sessions")
      .select(columns)
      .gte("started_at", new Date(from).toISOString())
      .lt("started_at", new Date(to).toISOString())
      .order("started_at", { ascending: false })
      .order("id", { ascending: false });
  const { data, error } = all
    ? await readAllRows((a, b) => selectSessions((columns) => query(columns).range(a, b)))
    : await selectSessions((columns) => query(columns).limit(200));
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
      ? {
          network: receipt.network,
          amount_total: Number(receipt.amount_total),
          gst: amount(receipt.gst),
          energy_amount: amount(receipt.energy_amount),
          kwh_billed: amount(receipt.kwh_billed),
        }
      : null,
  };
}

export async function listChargingSessions(owner: Owner, { from, to, withoutInvoice }: { from?: string; to?: string; withoutInvoice?: boolean }) {
  const end = to ? parseRangeEnd(to) : Date.now();
  const start = from ? parseInvoiceTime(from) : end - 30 * DAY;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { error: "from and to must be dates like 2026-10-21 or 2026-10-21T19:10." };
  const sessions = await sessionsBetween(owner, start, end);
  const receipts = await receiptsFor(owner, sessions.map((s) => s.id));
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
  energy_amount?: number;
  currency?: string;
  invoice_number?: string;
  source_ref?: string;
  session_id?: number;
  replace?: boolean;
  file_base64?: string;
  line_items?: SentLine[];
  details?: InvoiceDetail[];
};

// The file's type from its first bytes, never from a name the AI gives it.
function sniff(bytes: Buffer): { type: string; ext: string } | null {
  if (bytes.subarray(0, 4).toString("latin1") === "%PDF") return { type: "application/pdf", ext: "pdf" };
  if (bytes[0] === 0x89 && bytes.subarray(1, 4).toString("latin1") === "PNG") return { type: "image/png", ext: "png" };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  return null;
}

const LINE_COLUMNS_MISSING = ["42703", "PGRST204"];

// An invoice's lines, or null to clear them (a replaced invoice). The result is one line for the AI, or null
// when there's nothing to say. Before migration 20261104120000 the columns are missing: the invoice stays
// saved without lines.
async function saveLines(owner: Owner, sessionId: number, items: StoredItems | null): Promise<string | null> {
  const { error } = await ownerDb(owner)
    .from("charge_receipts")
    .update({ line_items: items, lines_at: items ? new Date().toISOString() : null })
    .eq("session_id", sessionId);
  if (error) {
    if (!LINE_COLUMNS_MISSING.includes(error.code)) console.warn("Saving invoice lines failed:", error.code);
    return items ? (LINE_COLUMNS_MISSING.includes(error.code) ? "Lines not saved: Uplink can't store lines yet." : "Lines not saved: try again later.") : null;
  }
  if (!items) return null;
  // Name the Rounding line reconcile added, so a count one more than was sent isn't a puzzle.
  const rounding = items.lines.find((l) => l.label === "Rounding" && l.kind === "other");
  return `Lines saved: ${items.lines.length}.${rounding ? ` One is a ₹${rounding.amount.toFixed(2)} Rounding line Uplink added so they add up to the total.` : ""}`;
}

// Details sent again for an invoice already saved: kept over the old ones when any are worth keeping.
async function addDetails(owner: Owner, sessionId: number, sent: InvoiceDetail[] | undefined) {
  const kept = keptDetails(sent);
  if (kept.length === 0) return;
  const { error } = await ownerDb(owner).from("charge_receipts").update({ details: kept }).eq("session_id", sessionId);
  if (error) console.warn("Saving invoice details failed:", error.code);
}

// Lines sent for an invoice already saved, checked against what it was saved with.
async function addLines(owner: Owner, sessionId: number, saved: { amount_total: number; gst: number | null; invoice_path: string | null }, sent: SentLine[]) {
  const checked = reconcile(sent, { amountTotal: Number(saved.amount_total), gst: amount(saved.gst) }, saved.invoice_path ?? null);
  return checked.ok ? saveLines(owner, sessionId, checked.items) : checked.message;
}

// line_items: the invoice's printed lines. Kept only when they add up (lib/invoice-items.ts reconcile);
// otherwise the invoice is saved as before and `lines` says why they weren't. Sent again for an invoice
// already saved (the same source or invoice number, or the same file or amount on its session), they're
// added to it, without a second invoice.
export async function attachInvoice(owner: Owner, input: AttachInput) {
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
    energyAmount: input.energy_amount ?? null,
  };
  const problem = invoiceProblem(invoice, now);
  if (problem) return { status: "rejected", reason: problem };
  if ((input.currency ?? "INR").toUpperCase() !== "INR") return { status: "rejected", reason: "Only invoices in INR are supported." };

  // Seen before: the scheduled run sees the same emails every 6 hours.
  const SEEN = "session_id, amount_total, gst, invoice_path";
  const seen = input.source_ref
    ? await ownerDb(owner).from("charge_receipts").select(SEEN).eq("source_ref", input.source_ref).maybeSingle()
    : input.invoice_number
      ? await ownerDb(owner).from("charge_receipts").select(SEEN).ilike("network", invoice.network).eq("invoice_number", input.invoice_number).maybeSingle()
      : { data: null, error: null };
  if (seen.error) throw new Error(`Reading invoices failed: ${seen.error.message}`);
  // replace: true goes on to save over it below, on its session.
  if (seen.data && !input.replace) {
    const saved = seen.data as { session_id: number; amount_total: number; gst: number | null; invoice_path: string | null };
    const sessionId = Number(saved.session_id);
    await addDetails(owner, sessionId, input.details);
    if (!input.line_items?.length) return { status: "already_attached", session_id: sessionId };
    return { status: "already_attached", session_id: sessionId, lines: await addLines(owner, sessionId, saved, input.line_items) };
  }

  let file: { bytes: Buffer; type: string; ext: string } | null = null;
  if (input.file_base64) {
    const bytes = Buffer.from(input.file_base64.replace(/^data:[^,]*,/, ""), "base64");
    if (bytes.length > MAX_FILE_BYTES) return { status: "rejected", reason: "The file is over 3 MB." };
    const kind = sniff(bytes);
    if (!kind) return { status: "rejected", reason: "The file isn't a PDF, PNG or JPEG." };
    file = { bytes, ...kind };
  }

  const nearby = await sessionsBetween(owner, startedAt - DAY, startedAt + DAY);
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
      const receipts = await receiptsFor(owner, result.candidates.map((s) => s.id));
      return { status: "candidates", reason: "More than one session fits. Ask the owner which one, then call again with session_id.", candidates: result.candidates.map((s) => describe(s, receipts.get(s.id))) };
    }
    session = result.session;
  }

  const existing = (await receiptsFor(owner, [session.id])).get(session.id);
  const digest = file ? createHash("sha256").update(file.bytes).digest("hex").slice(0, 16) : null;
  // The same invoice sent again with its lines: the same file, or with no file the same network and amount.
  const same =
    existing &&
    (file ? existing.invoice_path === `${session.id}/${digest}.${file.ext}` : existing.network.toLowerCase() === invoice.network.toLowerCase() && Number(existing.amount_total) === invoice.amountTotal);
  if (existing && !input.replace && same && input.line_items?.length) {
    await addDetails(owner, session.id, input.details);
    return { status: "already_attached", session_id: session.id, lines: await addLines(owner, session.id, existing, input.line_items) };
  }
  if (existing && !input.replace) {
    return { status: "session_has_invoice", reason: "This session already has an invoice. Call again with replace: true only if the owner says so.", session: describe(session, existing) };
  }

  let invoicePath: string | null = existing?.invoice_path ?? null;
  if (file) {
    invoicePath = `${session.id}/${digest}.${file.ext}`;
    const { error } = await ownerDb(owner).invoices().upload(invoicePath, file.bytes, { contentType: file.type, upsert: true });
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
    // Only when sent, so a database without the column yet still takes invoices without it.
    ...(invoice.energyAmount != null && { energy_amount: invoice.energyAmount }),
    currency: "INR",
    invoice_path: invoicePath,
    invoice_number: input.invoice_number ?? null,
    source_ref: input.source_ref ?? null,
    source: input.source_ref?.startsWith("gmail:") ? "gmail" : "chat",
    added_at: new Date(now).toISOString(),
    // A replaced invoice keeps none of the old one's details.
    details: keptDetails(input.details).length ? keptDetails(input.details) : null,
  };
  const { error } = await ownerDb(owner).from("charge_receipts").upsert(row, { onConflict: "session_id" });
  if (error) {
    // Unique source_ref or invoice number: another call saved it a moment ago.
    if (error.code === "23505") return { status: "already_attached", session_id: session.id };
    throw new Error(`Saving the invoice failed: ${error.message}`);
  }
  if (existing?.invoice_path && existing.invoice_path !== invoicePath) {
    await ownerDb(owner).invoices().remove([existing.invoice_path]);
  }
  let lines: string | null = null;
  if (input.line_items?.length) {
    const checked = reconcile(input.line_items, { amountTotal: invoice.amountTotal, gst: invoice.gst ?? null }, invoicePath);
    lines = checked.ok ? await saveLines(owner, session.id, checked.items) : checked.message;
  } else if (existing) {
    // A replaced invoice keeps none of the old one's lines.
    await saveLines(owner, session.id, null);
  }
  const attached = describe(session, { ...row, gst: row.gst ?? null, energy_amount: invoice.energyAmount ?? null, kwh_billed: row.kwh_billed ?? null });
  return { status: existing ? "replaced" : "attached", session: attached, ...(lines && { lines }) };
}

const monthOf = (iso: string) => istIso(iso).slice(0, 7);

// Spend and energy per IST month, from real bills only: Tesla's for Superchargers, invoices for the rest.
export async function chargingSummary(owner: Owner, months: number) {
  const now = new Date(Date.now() + IST_MS);
  const since = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1) - IST_MS;
  const [tesla, sessions] = await Promise.all([
    readAllRows((from, to) =>
      ownerDb(owner)
        .from("charging_sessions")
        .select("started_at, energy_kwh, cost_total")
        .gte("started_at", new Date(since).toISOString())
        .order("started_at")
        .order("session_id")
        .range(from, to),
    ),
    sessionsBetween(owner, since, Date.now() + DAY, { all: true }),
  ]);
  if (tesla.error && !["42P01", "PGRST205"].includes(tesla.error.code)) throw new Error(`Reading Supercharger sessions failed: ${tesla.error.message}`);
  const others = sessions.filter((s) => !s.supercharger && s.ended_at != null);
  const receipts = await receiptsFor(owner, others.map((s) => s.id));

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

export async function drivingSummary(owner: Owner) {
  const vin = (await loadPrimaryVehicle(owner))?.vin ?? null;
  const figures = await loadDrivingFigures(owner, vin, Date.now());
  const periods = Object.fromEntries(
    Object.entries(figures.periods).map(([period, p]) => [
      period,
      { km: p.current.km, kwh_per_100km: p.current.whPerKm === null ? null : p.current.whPerKm / 10, regen_kwh: p.current.regenKwh, previous_km: p.previous?.km ?? null },
    ]),
  );
  return {
    periods,
    odometer_km: figures.odometerKm,
    tracking_since: figures.since ? istIso(figures.since) : null,
    note: "week, month and year are the current calendar week, month and year in IST, so far.",
  };
}

// The invoice for each of these sessions that has one, for every spend figure and session row. hasFile:
// the invoice's file is stored, so the row can offer it. Never fails the page: a read error (or a
// database without the table yet) shows as no invoices.
// gst and energyAmount are as printed, for the Spend breakdown; null when the invoice didn't say. lines:
// the invoice's own lines when they were read and add up, else null.
export type SessionInvoiceAmount = {
  amount: number;
  gst: number | null;
  energyAmount: number | null;
  kwhBilled: number | null;
  network: string;
  station: string | null;
  hasFile: boolean;
  lines: InvoiceLine[] | null;
};

// What each attached invoice came to. A guest (a view link) gets the amounts only, as a charge's cost:
// never the invoice itself (its network, station, lines or file).
export async function invoicesBySession(owner: Owner, ids: number[]): Promise<Map<number, SessionInvoiceAmount>> {
  const all = await readInvoicesBySession(owner, ids);
  if (showsInvoices(owner)) return all;
  return new Map([...all].map(([id, i]) => [id, { ...i, network: "", station: null, hasFile: false, lines: null }]));
}

async function readInvoicesBySession(owner: Owner, ids: number[]): Promise<Map<number, SessionInvoiceAmount>> {
  if (DEMO) {
    const { demoInvoices } = await import("./demo");
    const all = demoInvoices();
    // The demo stores no files (the invoice route answers 404 there).
    return new Map(ids.flatMap((id) => {
      const i = all.get(id);
      return i ? [[id, { amount: i.amount, gst: i.gst, energyAmount: i.energyAmount, kwhBilled: i.kwhBilled, network: i.network, station: i.station, hasFile: false, lines: i.lines }] as const] : [];
    }));
  }
  if (ids.length === 0) return new Map();
  try {
    const [rows, lines] = await Promise.all([receiptsFor(owner, ids), linesFor(owner, ids)]);
    return new Map(
      [...rows].map(([id, r]) => [
        id,
        {
          amount: Number(r.amount_total),
          gst: amount(r.gst),
          energyAmount: amount(r.energy_amount),
          kwhBilled: amount(r.kwh_billed),
          network: r.network,
          station: r.station ?? null,
          hasFile: Boolean(r.invoice_path),
          lines: lines.get(id) ?? null,
        },
      ]),
    );
  } catch (err) {
    if (!/charge_receipts/.test(String(err))) console.warn("Invoices unavailable:", (err as Error).message);
    return new Map();
  }
}

export type SessionInvoice = {
  network: string;
  station: string | null;
  amountTotal: number;
  gst: number | null;
  energyAmount: number | null;
  kwhBilled: number | null;
  hasFile: boolean;
  lines: InvoiceLine[] | null;
  // As printed: the invoice's number, its own start and end (ISO), and its other details.
  invoiceNumber: string | null;
  startedAt: string | null;
  endedAt: string | null;
  details: InvoiceDetail[];
};

// The invoice attached to one session, for its page. Never fails the page: a read error (or a
// database without the table yet) shows as no invoice.
// As invoicesBySession: a guest gets what the charge cost and the kWh billed only, never the invoice's
// network, station, number, times, lines, printed details or file.
export async function sessionInvoice(owner: Owner, sessionId: number): Promise<SessionInvoice | null> {
  const invoice = await readSessionInvoice(owner, sessionId);
  if (!invoice || showsInvoices(owner)) return invoice;
  return { ...invoice, network: "", station: null, hasFile: false, lines: null, invoiceNumber: null, startedAt: null, endedAt: null, details: [] };
}

async function readSessionInvoice(owner: Owner, sessionId: number): Promise<SessionInvoice | null> {
  if (DEMO) {
    const { demoInvoices } = await import("./demo");
    const i = demoInvoices().get(sessionId);
    return i
      ? { network: i.network, station: i.station, amountTotal: i.amount, gst: i.gst, energyAmount: i.energyAmount, kwhBilled: i.kwhBilled, hasFile: false, lines: i.lines, invoiceNumber: i.invoiceNumber, startedAt: i.startedAt, endedAt: i.endedAt, details: i.details }
      : null;
  }
  const columns = "network, station, amount_total, gst, kwh_billed, invoice_path, invoice_number, started_at, ended_at, details";
  const read = (cols: string) => ownerDb(owner).from("charge_receipts").select(cols).eq("session_id", sessionId).maybeSingle();
  let { data, error } = await read(`${columns}, ${ENERGY}`);
  if (noEnergyColumn(error)) ({ data, error } = await read(columns));
  if (error) {
    if (!["42P01", "PGRST205"].includes(error.code)) console.warn("Invoice unavailable:", error.message);
    return null;
  }
  if (!data) return null;
  const row = data as unknown as Record<string, unknown>;
  const lines = row.invoice_path ? (await linesFor(owner, [sessionId])).get(sessionId) ?? null : null;
  return {
    network: row.network as string,
    station: (row.station as string | null) ?? null,
    amountTotal: Number(row.amount_total),
    gst: amount(row.gst),
    energyAmount: amount(row.energy_amount),
    kwhBilled: amount(row.kwh_billed),
    hasFile: Boolean(row.invoice_path),
    lines,
    invoiceNumber: (row.invoice_number as string | null) ?? null,
    startedAt: (row.started_at as string | null) ?? null,
    endedAt: (row.ended_at as string | null) ?? null,
    details: storedDetails(row.details),
  };
}

// For the owner-only invoice route: the stored file of one of the owner's invoices.
// Never for a guest (a view link). The route is the owner's alone too (proxy.ts).
export async function invoiceFile(owner: Owner, sessionId: number): Promise<{ body: Blob; type: string } | null> {
  if (!showsInvoices(owner)) return null;
  const { data, error } = await ownerDb(owner).from("charge_receipts").select("invoice_path").eq("session_id", sessionId).maybeSingle();
  if (error || !data?.invoice_path) return null;
  const file = await ownerDb(owner).invoices().download(data.invoice_path as string);
  if (file.error || !file.data) return null;
  return { body: file.data, type: file.data.type || "application/octet-stream" };
}
