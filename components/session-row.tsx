import { SessionLine, type SessionView } from "@/components/session-line";
import { splitSite } from "@/lib/charge-sessions";
import { formatClock, formatDayLabel, formatDuration, formatKwh, formatMoney, formatShortDate, formatTempRange } from "@/lib/format";
import type { ChargingSession } from "@/lib/server/charging";
import type { StreamChargeSession } from "@/lib/server/stream-charging";
import { cn } from "@/lib/utils";

const kwFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

export function rate(cost: number, energy: number, currency: string): string | null {
  return energy > 0 ? `${formatMoney(cost / energy, currency)}/kWh` : null;
}

// An invoice attached to a session the car reported (see invoicesBySession). hasFile: its file is stored.
export type RowInvoice = { amount: number; kwhBilled: number | null; hasFile: boolean };

// One row of the list: a Tesla Supercharger session (with cost and invoice), or one the car reported
// itself, with the invoice attached to it when there is one. A Tesla session that the car also reported
// keeps its own row and gains the peak power.
export type Listed = { key: string; started_at: string; tesla: ChargingSession | null; stream: StreamChargeSession | null; invoice: RowInvoice | null };

// Tesla's sessions (with the car's own record of each, when it has one) and the ones only the car
// reported, with their attached invoices, newest first (see matchSessions).
export function listSessions(
  pairs: { tesla: ChargingSession; stream: StreamChargeSession | null }[],
  streamOnly: StreamChargeSession[],
  invoices: ReadonlyMap<number, RowInvoice>,
): Listed[] {
  return [
    ...pairs.map((p) => ({ key: p.tesla.session_id, started_at: p.tesla.started_at, tesla: p.tesla, stream: p.stream, invoice: null })),
    ...streamOnly.map((s) => ({ key: `stream-${s.id}`, started_at: s.started_at, tesla: null, stream: s, invoice: invoices.get(s.id) ?? null })),
  ].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
}

// The station's name from OpenStreetMap when the station check found one (shown whole: it is
// "Operator, Area", not Tesla's "City, Site" that splitSite reads).
export function streamTitle(s: StreamChargeSession): string {
  if (s.supercharger) return "Supercharger";
  if (s.station_name) return s.station_name;
  return s.kind === "dc" ? "Third-party charger" : "AC charging";
}

// Whether any shown row is named from OpenStreetMap, so the page credits it.
export function hasStationNames(items: Listed[]): boolean {
  return items.some((item) => !item.tesla && item.stream?.station_name && !item.stream.supercharger);
}

// ODbL asks for the credit wherever OpenStreetMap's names show.
export function OsmCredit({ className }: { className?: string }) {
  return (
    <p className={cn("text-xs text-faint", className)}>
      Station names ©{" "}
      <a href="https://www.openstreetmap.org/copyright" className="underline underline-offset-2 hover:text-foreground">
        OpenStreetMap contributors
      </a>
      , ODbL
    </p>
  );
}

function levels(s: StreamChargeSession): string | null {
  return s.start_level !== null && s.end_level !== null ? `${Math.round(s.start_level)}% to ${Math.round(s.end_level)}%` : null;
}

// The battery's warm-up on a fast charger, which explains a slow session. AC charger details live on the car page.
function batteryTemp(s: StreamChargeSession): string | null {
  return s.kind === "dc" && s.temp_start_c !== null && s.temp_max_c !== null
    ? `battery ${formatTempRange(s.temp_start_c, s.temp_max_c)}`
    : null;
}

// Whether a list needs the Cost column: a row Tesla billed, or one with an attached invoice. Decided per
// list, so mixed rows keep one set of columns; a row without a bill shows a faint dash there, never an
// estimate.
export function hasCosts(items: Listed[]): boolean {
  return items.some((item) => item.tesla || item.invoice);
}

// Static class names, so Tailwind sees them. Wide fits "Yesterday" in the first column (with `now`);
// numbered puts a "#" column first.
function columns(wide: boolean, costs: boolean, numbered = false): string {
  if (numbered) return costs ? "grid-cols-charge-serial-cost" : "grid-cols-charge-serial";
  if (wide) return costs ? "grid-cols-charge-wide-cost" : "grid-cols-charge-wide";
  return costs ? "grid-cols-charge-cost" : "grid-cols-charge";
}

// The column names above a list of SessionRows, in the same grid. `numbered` for rows given a serial.
export function SessionHeader({ costs, wide = false, numbered = false }: { costs: boolean; wide?: boolean; numbered?: boolean }) {
  return (
    <div className={cn(columns(wide, costs, numbered), "grid gap-x-4 pb-2 text-xs text-faint")} aria-hidden="true">
      {numbered && <span>#</span>}
      <span>Date</span>
      <span>Session</span>
      <span className="text-right">Energy</span>
      {costs && <span className="text-right">Cost</span>}
    </div>
  );
}

// `costs` comes from hasCosts over the whole list. The invoice download sits before the cost, so a row
// without one leaves no gap and the last column stays flush right.
export function SessionRow({ item, serial, now, costs }: { item: Listed; serial?: number; now?: number; costs: boolean }) {
  const { tesla: s, stream, invoice: attached } = item;
  const invoice = s?.invoices.find((i) => i.contentId);
  const { place, city } = s ? splitSite(s.site_name) : { place: stream ? streamTitle(stream) : "", city: null };
  const stoppedAt = s ? s.stopped_at : (stream?.ended_at ?? null);
  const durationMs = stoppedAt ? Date.parse(stoppedAt) - Date.parse(item.started_at) : 0;
  const durationText = durationMs > 0 ? formatDuration(durationMs / 1000) : null;
  const currency = s?.currency ?? "INR";
  const rateText = s && s.cost_total !== null && s.energy_kwh !== null ? rate(s.cost_total, s.energy_kwh, currency) : null;
  const peakText = stream?.peak_power_kw ? `up to ${kwFormat.format(stream.peak_power_kw)} kW` : null;
  const energy = s ? s.energy_kwh : (stream?.energy_added_kwh ?? null);
  const tempText = stream && batteryTemp(stream);
  // Sessions the car streamed open their power curve; the title link covers the whole row.
  const href = stream ? `/stats/charging/${stream.id}` : null;
  const detail = s
    ? [city, durationText, peakText, tempText]
    : [stream?.station_name && !stream.supercharger && stream.kind.toUpperCase(), stream && levels(stream), stoppedAt ? durationText : "In progress", peakText, tempText];
  const view: SessionView = {
    className: cn(
      columns(now !== undefined, costs, serial !== undefined),
      "grid items-start gap-x-4 py-4 text-sm",
      href && "relative cursor-pointer transition-colors sm:-mx-3 sm:px-3 duration-150 hover:bg-muted focus-within:bg-muted",
    ),
    serial,
    date: now === undefined ? formatShortDate(item.started_at) : formatDayLabel(item.started_at, now),
    clock: formatClock(item.started_at),
    href,
    place,
    detail: detail.filter(Boolean).join(" · "),
    energy: energy === null ? null : formatKwh(energy),
    cost: !costs
      ? undefined
      : s && s.cost_total !== null
        ? {
            money: formatMoney(s.cost_total, currency),
            rate: rateText,
            invoice: invoice?.contentId
              ? { href: `/api/charging/invoice/${encodeURIComponent(invoice.contentId)}`, label: `Download invoice for ${formatShortDate(item.started_at)}` }
              : null,
          }
        : attached && stream
          ? {
              // ₹/kWh on the kWh billed, as charged, like the session's own page.
              money: formatMoney(attached.amount, "INR"),
              rate: rate(attached.amount, attached.kwhBilled ?? stream.energy_added_kwh ?? 0, "INR"),
              invoice: attached.hasFile ? { href: `/api/charging/receipt/${stream.id}`, label: `Download invoice for ${formatShortDate(item.started_at)}` } : null,
            }
          : null,
  };
  // The browser draws the row from these texts (see SessionLine), so a long list costs the page little.
  return <SessionLine view={view} />;
}
