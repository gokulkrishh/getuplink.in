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

  const rows: [string, string, string | null][] = [];
  if (capacity) rows.push(["Usable capacity", capacity.now, capacity.note]);
  if (full) rows.push(["Range at 100%", `≈ ${full.now}`, full.note]);
  if (added > 0) {
    rows.push(["Energy charged", formatKwh(added), `${finished.length} ${finished.length === 1 ? "charge" : "charges"} since ${formatShortDate(since)}`]);
    if (latestKwh) rows.push(["Charge cycles", (added / latestKwh).toFixed(1), "Energy charged ÷ usable capacity"]);
  }
  if (ac !== null || dc !== null) {
    rows.push(["Charging efficiency", [ac !== null && `AC ${percent(ac)}`, dc !== null && `DC ${percent(dc)}`].filter(Boolean).join(" · "), "Share of the charger's energy that reached the pack"]);
  }
  if (rows.length === 0) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-xs font-medium tracking-wide text-faint uppercase">Battery health</h2>
      <dl className="divide-y border-t">
        {rows.map(([label, value, note]) => (
          <div key={label} className="flex items-baseline justify-between gap-4 py-3 text-sm">
            <dt className="min-w-0">
              <span className="block">{label}</span>
              {note && <span className="block text-xs text-muted-foreground tabular-nums">{note}</span>}
            </dt>
            <dd className="shrink-0 font-mono font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-faint">Compared with the best week Uplink has seen, not with a new pack: it only knows what the car has reported since you connected it.</p>
    </section>
  );
}
