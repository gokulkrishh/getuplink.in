import { type Figure, Figures } from "@/components/stats/figures";
import { chargeEfficiency } from "@/lib/charge-sessions";
import type { WeeklyRange } from "@/lib/charge-level";
import { formatKm, formatKwh, formatShortDate } from "@/lib/format";
import type { StreamChargeSession } from "@/lib/server/stream-charging";
import type { WeeklyPack } from "@/lib/telemetry-derive";

const percent = (value: number) => `${Math.round(value * 100)}%`;

// The latest week against the best week on record: Uplink never assumes what the pack was when new.
function vsBest<T>(weeks: T[], value: (w: T) => number, format: (n: number) => string): { now: string; note: string | null } | null {
  const latest = weeks.at(-1);
  if (!latest) return null;
  const best = weeks.reduce((a, w) => (value(w) > value(a) ? w : a));
  if (weeks.length < 2 || best === latest) return { now: format(value(latest)), note: weeks.length < 2 ? "This week's median" : "Best week on record" };
  const change = (value(latest) - value(best)) / value(best);
  return { now: format(value(latest)), note: `${(change * 100).toFixed(1)}% vs best week, ${format(value(best))}` };
}

// Battery health after TeslaMate's dashboard, from what the car streamed: usable capacity and range at
// 100% against the best week seen, charge cycles and charging efficiency since tracking began.
export function BatteryHealth({ trend, range, sessions }: { trend: WeeklyPack[]; range: WeeklyRange[]; sessions: StreamChargeSession[] }) {
  const capacity = vsBest(trend, (w) => w.kwh, formatKwh);
  const full = vsBest(range, (w) => w.km, formatKm);
  const finished = sessions.filter((s) => s.ended_at !== null && s.energy_added_kwh !== null);
  const added = finished.reduce((sum, s) => sum + (s.energy_added_kwh ?? 0), 0);
  const since = finished.reduce((min, s) => Math.min(min, Date.parse(s.started_at)), Infinity);
  const latestKwh = trend.at(-1)?.kwh ?? null;
  const ac = chargeEfficiency(finished.filter((s) => s.kind === "ac"));
  const dc = chargeEfficiency(finished.filter((s) => s.kind === "dc"));

  const efficiency = "Charger's energy that reached the pack";
  const figures: Figure[] = [];
  if (capacity) figures.push({ label: "Usable capacity", value: capacity.now, note: capacity.note });
  if (full) figures.push({ label: "Range at 100%", value: `≈ ${full.now}`, note: full.note });
  if (added > 0) {
    figures.push({ label: "Energy charged", value: formatKwh(added), note: `${finished.length} ${finished.length === 1 ? "charge" : "charges"} since ${formatShortDate(since)}` });
    if (latestKwh) figures.push({ label: "Charge cycles", value: (added / latestKwh).toFixed(1), note: "Energy charged ÷ usable capacity" });
  }
  if (ac !== null) figures.push({ label: "AC efficiency", value: percent(ac), note: efficiency });
  if (dc !== null) figures.push({ label: "DC efficiency", value: percent(dc), note: efficiency });
  if (figures.length === 0) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium tracking-heading">Battery health</h2>
      <Figures figures={figures} />
      <p className="text-xs text-faint">Compared with the best week Uplink has seen, not with a new pack: it only knows what the car has reported since you connected it.</p>
    </section>
  );
}
