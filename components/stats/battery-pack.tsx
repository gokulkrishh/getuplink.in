import { BatteryTrend } from "@/components/stats/battery-trend";
import { unitNotes } from "@/components/stats/chart-caption";
import { formatKwh } from "@/lib/format";
import type { WeeklyPack } from "@/lib/telemetry-derive";

// The estimated full pack by week, from the streamed energy remaining and battery level.
export function BatteryPack({ trend }: { trend: WeeklyPack[] }) {
  if (trend.length < 2) return null;
  const latest = trend[trend.length - 1];
  return (
    <section id="battery" className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-lg font-medium tracking-heading">Usable capacity by week</h2>
        <p className="text-sm text-muted-foreground">Estimated full pack, weekly median. Now {formatKwh(latest.kwh)}.</p>
      </div>
      <figure className="space-y-3">
        <BatteryTrend points={trend} />
        <figcaption className="text-xs text-muted-foreground">
          How much energy a full battery holds, as the car estimates it: the middle value of each week&apos;s estimates. The scale starts near the
          readings, not at zero, so small changes show. {unitNotes(["kWh"])}
        </figcaption>
      </figure>
    </section>
  );
}
