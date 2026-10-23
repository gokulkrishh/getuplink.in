import { BatteryTrend } from "@/components/stats/battery-trend";
import { formatKwh } from "@/lib/format";
import type { WeeklyPack } from "@/lib/telemetry-derive";

// The estimated full pack by week, from the streamed energy remaining and battery level.
export function BatteryPack({ trend }: { trend: WeeklyPack[] }) {
  if (trend.length < 2) return null;
  const latest = trend[trend.length - 1];
  return (
    <section id="battery" className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-xs font-medium tracking-wide text-faint uppercase">Usable capacity by week</h2>
        <p className="text-sm text-muted-foreground">Estimated full pack, weekly median. Now {formatKwh(latest.kwh)}.</p>
      </div>
      <BatteryTrend points={trend} />
    </section>
  );
}
