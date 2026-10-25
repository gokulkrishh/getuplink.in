import { Download } from "lucide-react";
import Link from "next/link";
import { Tip } from "@/components/tip";
import { buttonVariants } from "@/components/ui/button";
import { splitSite } from "@/lib/charge-sessions";
import { formatClock, formatDayLabel, formatDuration, formatKwh, formatMoney, formatShortDate } from "@/lib/format";
import type { ChargingSession } from "@/lib/server/charging";
import type { StreamChargeSession } from "@/lib/server/stream-charging";
import { cn } from "@/lib/utils";
import { Measure } from "@/components/measure";

const kwFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

export function rate(cost: number, energy: number, currency: string): string | null {
  return energy > 0 ? `${formatMoney(cost / energy, currency)}/kWh` : null;
}

// One row of the list: a Tesla Supercharger session (with cost and invoice), or one the car reported
// itself. A Tesla session that the car also reported keeps its own row and gains the peak power.
export type Listed = { key: string; started_at: string; tesla: ChargingSession | null; stream: StreamChargeSession | null };

// Tesla's sessions (with the car's own record of each, when it has one) and the ones only the car
// reported, newest first (see matchSessions).
export function listSessions(pairs: { tesla: ChargingSession; stream: StreamChargeSession | null }[], streamOnly: StreamChargeSession[]): Listed[] {
  return [
    ...pairs.map((p) => ({ key: p.tesla.session_id, started_at: p.tesla.started_at, tesla: p.tesla, stream: p.stream })),
    ...streamOnly.map((s) => ({ key: `stream-${s.id}`, started_at: s.started_at, tesla: null, stream: s })),
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
    ? `battery ${Math.round(s.temp_start_c)} to ${Math.round(s.temp_max_c)} °C`
    : null;
}

// Whether a list needs the Cost column: only Tesla bills a session. Decided per list, so mixed rows keep
// one set of columns; a row without a cost shows a faint dash there.
export function hasCosts(items: Listed[]): boolean {
  return items.some((item) => item.tesla);
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
  const { tesla: s, stream } = item;
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
  return (
    <li className={cn(columns(now !== undefined, costs, serial !== undefined), "grid items-start gap-x-4 py-4 text-sm", href && "relative cursor-pointer transition-colors sm:-mx-3 sm:px-3 duration-150 hover:bg-muted focus-within:bg-muted")}>
      {serial !== undefined && <p className="pt-0.5 font-mono text-xs text-faint tabular-nums">{serial}</p>}
      <div className="space-y-1">
        <p className="tabular-nums">{now === undefined ? formatShortDate(item.started_at) : formatDayLabel(item.started_at, now)}</p>
        <p className="text-xs text-faint tabular-nums">{formatClock(item.started_at)}</p>
      </div>
      <div className="min-w-0 space-y-1">
        <p className="truncate font-medium">
          {href ? (
            <Link href={href} className="outline-none after:absolute after:inset-0">
              {place}
            </Link>
          ) : (
            place
          )}
        </p>
        <p className="truncate text-xs text-muted-foreground">{detail.filter(Boolean).join(" · ")}</p>
      </div>
      <p className="text-right font-mono font-medium whitespace-nowrap tabular-nums">{energy === null ? "—" : <Measure text={formatKwh(energy)} />}</p>
      {costs &&
        (s && s.cost_total !== null ? (
          <div className="space-y-1 text-right">
            <p className="flex items-center justify-end gap-1 font-mono font-medium whitespace-nowrap tabular-nums">
              {invoice?.contentId && (
                <a
                  href={`/api/charging/invoice/${encodeURIComponent(invoice.contentId)}`}
                  aria-label={`Download invoice for ${formatShortDate(item.started_at)}`}
                  className={buttonVariants({ variant: "ghost", size: "icon-xs", className: "group relative z-10 -my-0.5" })}
                >
                  <Download className="size-3.5" aria-hidden="true" />
                  <Tip>Download invoice</Tip>
                </a>
              )}
              {formatMoney(s.cost_total, currency)}
            </p>
            {rateText && <p className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{rateText}</p>}
          </div>
        ) : (
          <p className="text-right text-faint">—</p>
        ))}
    </li>
  );
}
