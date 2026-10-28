import { ChartCard } from "@/components/chart-card";
import { Figures } from "@/components/stats/figures";
import { formatWhPerKm, fourEndingWith, seasonComparison, seasonMonths, seasonName, seasonWaiting, type SeasonEfficiency as Seasons } from "@/lib/seasons";

// Wh/km in each of the last four Indian seasons, a tile each, after the energy use. The same in every
// period: a season is longer than most of them. All four tiles always show, oldest first, ending with the
// season now; one with no figures reads "—". With one season, the caption says what the comparison waits for.
export function SeasonEfficiency({ seasons, drivesFrom }: Seasons) {
  if (seasons.length === 0) return null;
  const comparison = seasonComparison(seasons);
  const last = (seasons.find((s) => s.current) ?? seasons[seasons.length - 1]).season;
  const figures = fourEndingWith(last).map((season) => {
    const s = seasons.find((x) => x.season === season);
    return s ? { label: seasonName(season), value: formatWhPerKm(s.whPerKm), note: seasonMonths(s) } : { label: seasonName(season), value: "—", note: "No drives tracked" };
  });
  // The tiles carry each season's figure; the caption says what stands out, or what the comparison waits for.
  return (
    <ChartCard
      title="Efficiency by season"
      description="Energy for each km, by season. Lower is better."
      caption={seasons.length > 1 ? (comparison ?? undefined) : seasonWaiting(seasons[0].season)}
    >
      <Figures figures={figures} />
    </ChartCard>
  );
}
