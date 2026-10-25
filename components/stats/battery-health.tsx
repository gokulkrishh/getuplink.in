import { type Figure, Figures } from "@/components/stats/figures";
import { chargeEfficiency } from "@/lib/charge-sessions";
import type { WeeklyRange } from "@/lib/charge-level";
import { formatKm, formatKwh } from "@/lib/format";
import { within } from "@/lib/kept";
import type { Timeframe } from "@/lib/periods";
import type { StreamChargeSession } from "@/lib/server/stream-charging";
import type { WeeklyPack } from "@/lib/telemetry-derive";

const percent = (value: number) => `${Math.round(value * 100)}%`;

// The latest week against the best week on record: Uplink never assumes what the pack was when new.
function vsBest<T>(weeks: T[], value: (w: T) => number, format: (n: number) => string): { now: string; note: string | null } | null {
  const latest = weeks.at(-1);
  if (!latest) return null;
  const best = weeks.reduce((a, w) => (value(w) > value(a) ? w : a));
  if (weeks.length < 2 || best === latest) return { now: format(value(latest)), note: weeks.length < 2 ? "Latest week's median" : "Latest week, the best on record" };
  const change = (value(latest) - value(best)) / value(best);
  return { now: format(value(latest)), note: `Latest week, ${(change * 100).toFixed(1)}% vs best week, ${format(value(best))}` };
}

// Battery health after TeslaMate's dashboard, from what the car streamed. Usable capacity and range at
// 100% are the latest week's, against the best week seen, whatever span is picked; the energy charged, charge
// cycles and charging efficiency are the span's.
export function BatteryHealth({ trend, range, sessions, frame }: { trend: WeeklyPack[]; range: WeeklyRange[]; sessions: StreamChargeSession[]; frame: Timeframe }) {
  const capacity = vsBest(trend, (w) => w.kwh, formatKwh);
  const full = vsBest(range, (w) => w.km, formatKm);
  const finished = within(
    sessions.filter((s) => s.ended_at !== null && s.energy_added_kwh !== null),
    frame.span,
    (s) => Date.parse(s.started_at),
  );
  const added = finished.reduce((sum, s) => sum + (s.energy_added_kwh ?? 0), 0);
  const latestKwh = trend.at(-1)?.kwh ?? null;
  const ac = chargeEfficiency(finished.filter((s) => s.kind === "ac"));
  const dc = chargeEfficiency(finished.filter((s) => s.kind === "dc"));

  const efficiency = `Charger's energy that reached the pack, ${frame.words}`;
  const figures: Figure[] = [];
  if (capacity) figures.push({ label: "Usable capacity now", value: capacity.now, note: capacity.note });
  if (full) figures.push({ label: "Range at 100% now", value: `≈ ${full.now}`, note: full.note });
  if (added > 0) {
    figures.push({ label: "Energy charged", value: formatKwh(added), note: `${finished.length} ${finished.length === 1 ? "charge" : "charges"} ${frame.words}` });
    if (latestKwh) figures.push({ label: "Charge cycles", value: (added / latestKwh).toFixed(1), note: `Energy charged ÷ usable capacity, ${frame.words}` });
  }
  if (ac !== null) figures.push({ label: "AC efficiency", value: percent(ac), note: efficiency });
  if (dc !== null) figures.push({ label: "DC efficiency", value: percent(dc), note: efficiency });
  if (figures.length === 0) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium tracking-heading">Battery health</h2>
      <Figures figures={figures} />
      {added === 0 && <p className="text-sm text-muted-foreground">No finished charges {frame.words}.</p>}
      <p className="text-xs text-faint">Compared with the best week Uplink has seen, not with a new pack: it only knows what the car has reported since you connected it.</p>
    </section>
  );
}
