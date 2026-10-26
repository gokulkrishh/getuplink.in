import { ChartCard } from "@/components/chart-card";
import { Figures } from "@/components/stats/figures";
import { monthShort } from "@/lib/periods";
import { formatWhPerKm, seasonComparison, seasonMonths, seasonName, seasonWaiting, type SeasonEfficiency as Seasons } from "@/lib/seasons";

// Wh/km in each of the last four Indian seasons, a tile each, after the energy use. The same in every
// period: a season is longer than most of them. Only seasons with figures show; with one, it says what the
// comparison waits for.
export function SeasonEfficiency({ seasons, drivesFrom }: Seasons) {
  if (seasons.length === 0) return null;
  const comparison = seasonComparison(seasons);
  const figures = seasons.map((s) => ({ label: seasonName(s.season), value: formatWhPerKm(s.whPerKm), note: seasonMonths(s) }));
  // The tiles carry each season's figure; the caption says what stands out, or what the comparison waits for.
  return (
    <ChartCard
      title="Efficiency by season"
      description="Energy for each km, by season. Lower is better."
      unit="Wh/km"
      info={
        <>
          <p>Winter is Dec to Feb, summer Mar to May, monsoon Jun to Sept and post-monsoon Oct and Nov.</p>
          {drivesFrom !== null && (
            <p>Before {monthShort(drivesFrom)}, energy used while parked (Sentry Mode, climate) counts too, so older seasons can read a little higher.</p>
          )}
        </>
      }
      caption={seasons.length > 1 ? (comparison ?? undefined) : seasonWaiting(seasons[0].season)}
    >
      <Figures figures={figures} />
    </ChartCard>
  );
}
