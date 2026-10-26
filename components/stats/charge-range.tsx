import { ChartCard } from "@/components/chart-card";
import { Value } from "@/components/stats/figures";
import { formatShortDate } from "@/lib/format";
import type { Timeframe } from "@/lib/periods";
import type { StreamChargeSession } from "@/lib/server/stream-charging";
import { median } from "@/lib/telemetry-derive";
import { Measure } from "@/components/measure";

const LISTED = 10;

const kindLabel = (s: StreamChargeSession) => (s.supercharger ? "Supercharger" : s.kind.toUpperCase());

// Where charges start and stop, after TeslaMate's charge delta, for the charges in the span: the median
// start and end level, then the latest of them as bars across 0 to 100%, each with its numbers written out.
// `serialOf` is each charge's number in the session list, so the same charge has the same number there.
export function ChargeRange({ sessions, frame, serialOf }: { sessions: StreamChargeSession[]; frame: Timeframe; serialOf: (s: StreamChargeSession) => number | undefined }) {
  const finished = sessions.filter((s) => s.ended_at !== null && s.start_level !== null && s.end_level !== null && s.end_level > s.start_level);
  const latest = [...finished].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at)).slice(0, LISTED);
  const description = "Where charges started and stopped, on a battery scale from 0 to 100%. Each bar is filled from the level a charge started at to where it stopped.";
  if (finished.length === 0) {
    return <ChartCard title="Charge range" description={description} empty={`No finished charges ${frame.words}`} />;
  }
  const from = Math.round(median(finished.map((s) => s.start_level!)));
  const to = Math.round(median(finished.map((s) => s.end_level!)));

  return (
    <ChartCard
      title="Charge range"
      description={description}
      terms={["AC", "DC"]}
      summary={
        <div className="space-y-2">
          <p className="font-mono text-4xl font-medium tracking-tight tabular-nums">
            <Value text={`${from}% to ${to}%`} />
          </p>
          <p className="text-sm text-muted-foreground">
            Typical start and end, the median of {finished.length} {finished.length === 1 ? "charge" : "charges"}
          </p>
        </div>
      }
      caption={`${frame.title}. The bars are the latest ${latest.length === 1 ? "charge" : `${latest.length} charges`}, newest first.`}
    >
      <div>
        <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] border-b pb-2 text-xs text-faint" aria-hidden="true">
          <span>#</span>
          <span>Charge</span>
        </div>
        <ul className="divide-y">
          {latest.map((s) => {
            const [a, b] = [Math.round(s.start_level!), Math.round(s.end_level!)];
            return (
              <li key={s.id} className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-baseline py-3">
                <span className="font-mono text-xs text-faint tabular-nums">{serialOf(s) ?? ""}</span>
                <div className="space-y-1">
                  <p className="flex justify-between gap-3 text-sm tabular-nums">
                    <span className="text-muted-foreground">
                      {formatShortDate(s.started_at)} · {kindLabel(s)}
                    </span>
                    <span className="font-mono">
                      <Measure text={`${a}% to ${b}%`} />
                    </span>
                  </p>
                  <div className="relative h-2 bg-muted" aria-hidden="true">
                    <div className="absolute inset-y-0 bg-chart-accent" style={{ left: `${a}%`, width: `${b - a}%` }} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </ChartCard>
  );
}
