import { Download } from "lucide-react";
import Link from "next/link";
import { Tip } from "@/components/tip";
import { buttonVariants } from "@/components/ui/button";
import { splitSite } from "@/lib/charge-sessions";
import { formatClock, formatDayLabel, formatDuration, formatKwh, formatMoney, formatShortDate } from "@/lib/format";
import type { ChargingSession } from "@/lib/server/charging";
import type { StreamChargeSession } from "@/lib/server/stream-charging";
import { cn } from "@/lib/utils";

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

export function streamTitle(s: StreamChargeSession): string {
  if (s.supercharger) return "Supercharger";
  return s.kind === "dc" ? "Third-party charger" : "AC charging";
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

export function SessionRow({ item, serial, now }: { item: Listed; serial?: number; now?: number }) {
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
    : [stream && levels(stream), stoppedAt ? durationText : "In progress", peakText, tempText];
  return (
    <li className={cn(now === undefined ? "grid-cols-session" : "grid-cols-session-wide", "grid items-start gap-x-4 py-4 text-sm", href && "relative")}>
      <div className="space-y-1">
        <p className="tabular-nums">{now === undefined ? formatShortDate(item.started_at) : formatDayLabel(item.started_at, now)}</p>
        <p className="text-xs text-faint tabular-nums">{formatClock(item.started_at)}</p>
      </div>
      <div className="min-w-0 space-y-1">
        <p className="truncate font-medium">
          {serial !== undefined && <span className="mr-2 font-mono text-xs font-normal text-faint tabular-nums">#{serial}</span>}
          {href ? (
            <Link href={href} className="after:absolute after:inset-0 hover:underline hover:underline-offset-4">
              {place}
            </Link>
          ) : (
            place
          )}
        </p>
        <p className="truncate text-xs text-muted-foreground">{detail.filter(Boolean).join(" · ")}</p>
      </div>
      <div className="space-y-1 text-right">
        {s ? (
          <>
            <p className="font-mono font-medium tabular-nums">{s.cost_total === null ? "—" : formatMoney(s.cost_total, currency)}</p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {energy === null ? "—" : formatKwh(energy)}
                            {rateText && <span> · {rateText}</span>}
            </p>
          </>
        ) : (
          <p className="font-mono font-medium tabular-nums">{energy === null ? "—" : formatKwh(energy)}</p>
        )}
      </div>
      <div className="flex self-center">
        {s && invoice?.contentId && (
          <a
            href={`/api/charging/invoice/${encodeURIComponent(invoice.contentId)}`}
            aria-label={`Download invoice for ${formatShortDate(item.started_at)}`}
            className={buttonVariants({ variant: "ghost", size: "icon-xs", className: "group relative" })}
          >
            <Download className="size-3.5" aria-hidden="true" />
            <Tip>Download invoice</Tip>
          </a>
        )}
      </div>
    </li>
  );
}
