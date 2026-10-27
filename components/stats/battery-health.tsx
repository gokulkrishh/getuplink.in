import { ChartCard } from "@/components/chart-card";
import { type Figure, Figures } from "@/components/stats/figures";
import { chargeEfficiency } from "@/lib/charge-sessions";
import type { WeeklyRange } from "@/lib/charge-level";
import { CONSUMPTION_DAYS, recentConsumption } from "@/lib/drive-stats";
import type { Drive } from "@/lib/drives";
import { DECIMALS, formatKm, formatKwh, formatNumber, formatRangeKm, formatShortDate } from "@/lib/format";
import { within } from "@/lib/kept";
import type { Timeframe } from "@/lib/periods";
import type { StreamChargeSession } from "@/lib/server/stream-charging";
import type { WeeklyPack } from "@/lib/telemetry-derive";
import type { TeslaPack } from "@/lib/tesla-pack";

const percent = (value: number) => `${Math.round(value * 100)}%`;

// The latest week against the best week on record: Uplink never assumes what the pack was when new.
function vsBest<T>(weeks: T[], value: (w: T) => number, format: (n: number) => string): { now: string; note: string | null } | null {
  const latest = weeks.at(-1);
  if (!latest) return null;
  const best = weeks.reduce((a, w) => (value(w) > value(a) ? w : a));
  if (weeks.length < 2 || best === latest) return { now: format(value(latest)), note: weeks.length < 2 ? "Latest week" : "Latest week, the best on record" };
  const change = (value(latest) - value(best)) / value(best);
  return { now: format(value(latest)), note: `Latest week, ${Math.abs(change * 100).toFixed(1)}% below the best week, ${format(value(best))}` };
}

// Battery health after TeslaMate's dashboard, from what the car streamed. Usable capacity and range at
// 100% are the latest week's, against the best week seen, whatever span is picked; the energy charged, charge
// cycles and charging efficiency are the span's. Tesla's own full-pack figure is its latest report, next to
// the estimate as it is: the two may count the pack differently, so neither is measured against the other.
// Range at 100% is Tesla's rated range; the real-world range beside it is the latest usable capacity over
// the owner's own consumption in the last CONSUMPTION_DAYS of drives (`drives`, see recentConsumption),
// only when both are known.
export function BatteryHealth({
  trend,
  range,
  sessions,
  frame,
  teslaPack,
  drives,
  now,
}: {
  trend: WeeklyPack[];
  range: WeeklyRange[];
  sessions: StreamChargeSession[];
  frame: Timeframe;
  teslaPack: TeslaPack | null;
  drives: Drive[];
  now: number;
}) {
  const capacity = vsBest(trend, (w) => w.kwh, formatKwh);
  const full = vsBest(range, (w) => w.km, formatRangeKm);
  const usage = recentConsumption(drives, now);
  const finished = within(
    sessions.filter((s) => s.ended_at !== null && s.energy_added_kwh !== null),
    frame.span,
    (s) => Date.parse(s.started_at),
  );
  const added = finished.reduce((sum, s) => sum + (s.energy_added_kwh ?? 0), 0);
  const latestKwh = trend.at(-1)?.kwh ?? null;
  const ac = chargeEfficiency(finished.filter((s) => s.kind === "ac"));
  const dc = chargeEfficiency(finished.filter((s) => s.kind === "dc"));

  const words = frame.words.charAt(0).toUpperCase() + frame.words.slice(1);
  const efficiency = words;
  const figures: Figure[] = [];
  if (capacity) figures.push({ label: "Usable capacity now", value: capacity.now, note: capacity.note });
  if (teslaPack) figures.push({ label: "Full pack now, per Tesla", value: formatKwh(teslaPack.kwh), note: `Last reported ${formatShortDate(teslaPack.at)}` });
  if (full) figures.push({ label: "Range at 100% now", value: `≈ ${full.now}`, note: full.note });
  if (latestKwh && usage) {
    figures.push({
      label: "Real range at 100%",
      value: `≈ ${formatRangeKm((latestKwh * 1000) / usage.whPerKm)}`,
      note: `At your ${formatNumber(usage.whPerKm, DECIMALS.whPerKm)} Wh/km, from ${formatKm(usage.km)} driven in the last ${CONSUMPTION_DAYS} days`,
    });
  }
  // The span's tiles are the same in every period (an empty span says so in the tile), so the section keeps
  // one height and the page below doesn't sit under a gap. Efficiency tiles show when any charge of that
  // kind has ever been measured.
  const ever = sessions.filter((s) => s.ended_at !== null && s.energy_added_kwh !== null);
  const none = `No finished charges ${frame.words}`;
  figures.push({ label: "Energy charged", value: added > 0 ? formatKwh(added) : "—", note: added > 0 ? `${finished.length} ${finished.length === 1 ? "charge" : "charges"} ${frame.words}` : none });
  if (latestKwh) figures.push({ label: "Charge cycles", value: (added / latestKwh).toFixed(1), note: words });
  if (chargeEfficiency(ever.filter((s) => s.kind === "ac")) !== null) figures.push({ label: "AC efficiency", value: ac !== null ? percent(ac) : "—", note: ac !== null ? efficiency : `No AC charge to measure ${frame.words}` });
  if (chargeEfficiency(ever.filter((s) => s.kind === "dc")) !== null) figures.push({ label: "DC efficiency", value: dc !== null ? percent(dc) : "—", note: dc !== null ? efficiency : `No DC charge to measure ${frame.words}` });
  if (figures.length === 0) return null;

  return (
    <ChartCard
      title="Battery health"
      description="What the pack holds now, against its best week."
      unit="kWh"
      terms={["usable capacity", ...(teslaPack ? ["full pack, per Tesla"] : []), "range at 100%", "charge cycles", "charging efficiency", "AC and DC"]}
      info={
        <>
          <p>Best week means the best Uplink has seen since you connected, not a new battery.</p>
          <p>Range at 100% is Tesla&apos;s own estimate. Real range is what your last {CONSUMPTION_DAYS} days of driving suggest.</p>
        </>
      }
    >
      <Figures figures={figures} />
    </ChartCard>
  );
}
