import { Value } from "@/components/stats/figures";
import { formatShortDate } from "@/lib/format";
import type { Timeframe } from "@/lib/periods";
import type { StreamChargeSession } from "@/lib/server/stream-charging";
import { median } from "@/lib/telemetry-derive";

const LISTED = 10;

const kindLabel = (s: StreamChargeSession) => (s.supercharger ? "Supercharger" : s.kind.toUpperCase());

// Where charges start and stop, after TeslaMate's charge delta, for the charges in the span: the median
// start and end level, then the latest of them as bars across 0–100%, each with its numbers written out.
// `serialOf` is each charge's number in the session list, so the same charge has the same number there.
export function ChargeRange({ sessions, frame, serialOf }: { sessions: StreamChargeSession[]; frame: Timeframe; serialOf: (s: StreamChargeSession) => number | undefined }) {
  const finished = sessions.filter((s) => s.ended_at !== null && s.start_level !== null && s.end_level !== null && s.end_level > s.start_level);
  const latest = [...finished].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at)).slice(0, LISTED);
  if (finished.length === 0) {
    return (
      <section className="space-y-2">
        <h2 className="text-lg font-medium tracking-heading">Charge range</h2>
        <p className="text-sm text-muted-foreground">No finished charges {frame.words}.</p>
      </section>
    );
  }
  const from = Math.round(median(finished.map((s) => s.start_level!)));
  const to = Math.round(median(finished.map((s) => s.end_level!)));

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg font-medium tracking-heading">Charge range</h2>
        <p className="font-mono text-4xl font-medium tracking-tight tabular-nums">
          <Value text={`${from}% to ${to}%`} />
        </p>
        <p className="text-sm text-muted-foreground">
          {frame.title}. Typical start and end, median of {finished.length} {finished.length === 1 ? "charge" : "charges"}
          {finished.length > LISTED && `. The latest ${LISTED} below`}
        </p>
      </div>
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
                      {a}% to {b}%
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
      <p className="text-xs text-muted-foreground">
        Your latest {latest.length} {latest.length === 1 ? "charge" : "charges"} {frame.words}, newest first. Each bar spans 0 to 100% battery and is filled
        from the level the charge started at to where it stopped.
      </p>
    </section>
  );
}
