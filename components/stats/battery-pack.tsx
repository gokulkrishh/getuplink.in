import { BatteryTrend } from "@/components/stats/battery-trend";
import { unitNotes } from "@/components/stats/chart-caption";
import { ChartNote } from "@/components/stats/chart-note";
import { formatKwh, formatShortDate } from "@/lib/format";
import { backTo, weeksIn } from "@/lib/kept";
import type { Timeframe } from "@/lib/periods";
import type { WeeklyPack } from "@/lib/telemetry-derive";

// Usable capacity by week (see weeklyUsable), from the streamed energy remaining and battery level: the
// weeks that overlap the span, as far back as the estimates go (12 weeks). The page keeps its id outside, since each
// period draws its own copy.
export function BatteryPack({ trend, frame }: { trend: WeeklyPack[]; frame: Timeframe }) {
  if (trend.length < 2) return null;
  const weeks = weeksIn(trend, frame.span);
  const latest = trend[trend.length - 1];
  const cut = backTo(frame.span, trend[0].weekStart, "Weekly estimates");
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg font-medium tracking-heading">Usable capacity by week</h2>
        <p className="text-sm text-muted-foreground">
          The energy between 0% and 100%, one figure a week. Latest week {formatKwh(latest.kwh)}.
        </p>
      </div>
      <figure className="space-y-3">
        {weeks.length >= 2 ? (
          <BatteryTrend points={weeks} />
        ) : (
          <ChartNote>
            {weeks.length === 1
              ? `Week of ${formatShortDate(weeks[0].weekStart)}: ${formatKwh(weeks[0].kwh)}. A line needs two weeks.`
              : `No weekly estimate ${frame.words}.`}
          </ChartNote>
        )}
        <figcaption className="text-xs text-muted-foreground">
          How much energy the battery gives from 100% down to 0%, worked out from each week&apos;s energy-left and charge-level readings. A week
          shows once its charge moved by at least 15 points. The scale starts near the readings, not at zero, so small changes show. {unitNotes(["kWh"])} {frame.title}.{cut && ` ${cut}`}
        </figcaption>
      </figure>
    </section>
  );
}
