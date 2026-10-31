import { ChartCard } from "@/components/chart-card";
import BatteryTrendPlot from "@/components/stats/battery-trend-plot";
import { formatKwh, formatShortDate } from "@/lib/format";
import { backTo, weeksIn } from "@/lib/kept";
import type { Timeframe } from "@/lib/periods";
import type { TeslaPack } from "@/lib/tesla-pack";
import type { WeeklyPack } from "@/lib/telemetry-derive";

// Battery health over time, one chart: usable capacity by week (see weeklyUsable, from the streamed energy
// remaining and battery level) as the main line, and Tesla's own full-pack figure by week as a second line
// when the car reported it in two weeks or more. The weeks that overlap the span, as far back as the
// estimates go (12 weeks). Tesla's figure only comes when it changes, so its line has a point only in weeks
// with a new figure. The page keeps its id outside, since each period draws its own copy.
export function BatteryHealthChart({ trend, pack, frame }: { trend: WeeklyPack[]; pack: TeslaPack | null; frame: Timeframe }) {
  const tesla = pack?.weekly ?? [];
  if (trend.length < 2 && tesla.length < 2) return null;
  const usable = weeksIn(trend, frame.span);
  const reported = weeksIn(tesla, frame.span);
  const firsts = [trend[0]?.weekStart, tesla[0]?.weekStart].filter((t): t is number => t !== undefined);
  const both = reported.length >= 2 && usable.length >= 2;
  const one = usable[0] ?? reported[0];
  return (
    <ChartCard
      title="Battery health over time"
      description="How much a full charge holds, week by week."
      info={`A falling line means the battery holds less.${both ? " Tesla's figure comes from the car, so it can differ from Uplink's." : ""}`}
      caption={backTo(frame.span, Math.min(...firsts), "Weekly estimates")}
      empty={
        usable.length < 2 &&
        reported.length < 2 &&
        (one
          ? `Week of ${formatShortDate(one.weekStart)}: ${formatKwh(one.kwh)}${usable.length === 0 ? ", Tesla's figure" : ""}. The line appears after two weeks.`
          : "No weekly estimate.")
      }
    >
      <BatteryTrendPlot usable={usable} tesla={reported} />
    </ChartCard>
  );
}
