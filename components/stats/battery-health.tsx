import { ChartCard } from "@/components/chart-card";
import { type Figure, Figures } from "@/components/stats/figures";
import type { WeeklyRange } from "@/lib/charge-level";
import { CONSUMPTION_DAYS, recentConsumption } from "@/lib/drive-stats";
import type { Drive } from "@/lib/drives";
import { DECIMALS, formatKm, formatKwh, formatNumber, formatPercent, formatRangeKm } from "@/lib/format";
import type { WeeklyPack } from "@/lib/telemetry-derive";

// The latest week against the best week on record: Uplink never assumes what the pack was when new.
function vsBest<T>(weeks: T[], value: (w: T) => number, format: (n: number) => string): { now: string; note: string | null } | null {
  const latest = weeks.at(-1);
  if (!latest) return null;
  const best = weeks.reduce((a, w) => (value(w) > value(a) ? w : a));
  if (weeks.length < 2 || best === latest) return { now: format(value(latest)), note: weeks.length < 2 ? "Latest week" : "Latest week, the best on record" };
  const change = (value(latest) - value(best)) / value(best);
  return { now: format(value(latest)), note: `Latest week, ${formatPercent(Math.abs(change * 100), 1)} below the best week, ${format(value(best))}` };
}

// Battery health, from what the car streamed: the latest week's usable capacity against the best week seen
// (Uplink never assumes what the pack was when new), and the real-world range at 100%, the latest usable
// capacity over the owner's own consumption in the last CONSUMPTION_DAYS of drives (`drives`, see
// recentConsumption). Without that, Tesla's rated range at 100% against its best week.
export function BatteryHealth({
  trend,
  range,
  drives,
  now,
}: {
  trend: WeeklyPack[];
  range: WeeklyRange[];
  drives: Drive[];
  now: number;
}) {
  const capacity = vsBest(trend, (w) => w.kwh, formatKwh);
  const full = vsBest(range, (w) => w.km, formatRangeKm);
  const usage = recentConsumption(drives, now);
  const latestKwh = trend.at(-1)?.kwh ?? null;

  // Two tiles answer "is it ageing?": what the pack holds against its best week, and how far a full charge
  // takes the owner at their own driving (Tesla's rated range when that isn't known yet).
  const figures: Figure[] = [];
  if (capacity) figures.push({ label: "Usable capacity now", value: capacity.now, note: capacity.note });
  if (latestKwh && usage) {
    figures.push({
      label: "Real range at 100%",
      value: `About ${formatRangeKm((latestKwh * 1000) / usage.whPerKm)}`,
      note: `At your ${formatNumber(usage.whPerKm, DECIMALS.whPerKm)} Wh/km, from ${formatKm(usage.km)} driven in the last ${CONSUMPTION_DAYS} days`,
    });
  } else if (full) figures.push({ label: "Range at 100% now", value: `About ${full.now}`, note: full.note });
  if (figures.length === 0) return null;

  return (
    <ChartCard
      title="Battery health"
      description="What the battery holds now, against its best week."
    >
      <Figures figures={figures} />
    </ChartCard>
  );
}
