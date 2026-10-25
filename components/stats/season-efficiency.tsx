import { Figures } from "@/components/stats/figures";
import { monthShort } from "@/lib/periods";
import { formatWhPerKm, seasonComparison, seasonMonths, seasonName, seasonSentence, seasonWaiting, type SeasonEfficiency as Seasons } from "@/lib/seasons";

// Wh/km in each of the last four Indian seasons, a tile each, after the energy use. The same in every
// period: a season is longer than most of them. Only seasons with figures show; with one, it says what the
// comparison waits for.
export function SeasonEfficiency({ seasons, drivesFrom }: Seasons) {
  if (seasons.length === 0) return null;
  const comparison = seasonComparison(seasons);
  const figures = seasons.map((s) => ({ label: seasonName(s.season), value: formatWhPerKm(s.whPerKm), note: seasonMonths(s) }));
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-medium tracking-heading">Efficiency by season</h2>
        {seasons.length > 1 ? (
          <p className="text-sm text-muted-foreground tabular-nums">
            {seasonSentence(seasons)}.{comparison && ` ${comparison}`}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">{seasonWaiting(seasons[0].season)}</p>
        )}
      </div>
      <Figures figures={figures} />
      <div className="space-y-1 text-xs text-faint">
        <p>Energy used per km driven in each season, lower is better. Winter is Dec to Feb, summer Mar to May, monsoon Jun to Sept and post-monsoon Oct and Nov.</p>
        {drivesFrom !== null && (
          <p>Before {monthShort(drivesFrom)}, energy used while parked (Sentry Mode, climate) counts too, so older seasons can read a little higher.</p>
        )}
      </div>
    </section>
  );
}
