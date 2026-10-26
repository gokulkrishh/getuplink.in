import { ChartCard } from "@/components/chart-card";
import { BatteryTrend } from "@/components/stats/battery-trend";
import { periodPhrase } from "@/components/stats/chart-caption";
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
    <ChartCard
      title="Usable capacity by week"
      description={`Usable capacity week by week${weeks.length >= 2 ? `, ${periodPhrase(frame)}` : ""}. Latest week ${formatKwh(latest.kwh)}.`}
      unit="kWh"
      terms={["usable capacity"]}
      info="The scale starts near the readings, not at zero, so small changes show."
      caption={cut}
      empty={
        weeks.length < 2 &&
        (weeks.length === 1
          ? `Week of ${formatShortDate(weeks[0].weekStart)}: ${formatKwh(weeks[0].kwh)}. A line needs two weeks.`
          : `No weekly estimate ${frame.words}.`)
      }
    >
      <BatteryTrend points={weeks} />
    </ChartCard>
  );
}
