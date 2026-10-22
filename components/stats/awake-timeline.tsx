import { AwakeStrip } from "@/components/stats/awake-strip";
import { type DayStrip, hasPresence, type Presence } from "@/lib/awake";
import { formatDayLabel, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATES: { state: Presence; label: string; className: string }[] = [
  { state: "online", label: "Online", className: "bg-chart-accent" },
  { state: "asleep", label: "Asleep", className: "bg-muted-foreground/30" },
  { state: "offline", label: "Offline", className: "bg-muted-foreground/70" },
  // Hollow with a hairline, like its legend square, so a day with no data can't pass for asleep.
  { state: "unknown", label: "No data", className: "border border-muted-foreground/25" },
];
const classes = Object.fromEntries(STATES.map((s) => [s.state, s.className])) as Record<Presence, string>;

// A thin strip per IST day for the last 14 days, newest on top: when the car was online, asleep or
// offline. Updates only download while it's awake, so this answers "why hasn't it arrived yet?".
export function AwakeTimeline({ days, now }: { days: DayStrip[]; now: number }) {
  if (!hasPresence(days)) return null;
  const onlineMs = days.flatMap((d) => d.runs).reduce((sum, r) => sum + (r.state === "online" ? r.end - r.start : 0), 0);
  return (
    <section className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-xs font-medium tracking-wide text-faint uppercase">Online and asleep</h2>
        <p className="text-sm text-muted-foreground tabular-nums">
          About {formatDuration(onlineMs / days.length / 1000)} online a day, last 14 days
        </p>
        <p className="text-xs text-muted-foreground">
          Updates download only while the car is awake. Asleep runs from a check that found it asleep until the car next sends data.
        </p>
      </div>
      <div className="space-y-3 bg-muted px-3 pt-4 pb-3">
        <ol className="space-y-1.5">
          {[...days].reverse().map((d) => (
            <li key={d.day} className="flex items-center gap-3">
              <span className="w-16 shrink-0 text-xs text-faint">{formatDayLabel(d.start, now)}</span>
              <AwakeStrip start={d.start} runs={d.runs} classes={classes} />
              <span className="sr-only">{summary(d)}</span>
            </li>
          ))}
        </ol>
        <div className="flex gap-3 text-xs text-faint" aria-hidden="true">
          <span className="w-16 shrink-0" />
          <div className="relative h-4 flex-1 tabular-nums">
            {["12 AM", "6 AM", "12 PM", "6 PM"].map((label, k) => (
              <span key={label} className="absolute" style={{ left: `${k * 25}%` }}>
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {STATES.map((s) => (
          <li key={s.state} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2", s.className)} aria-hidden="true" />
            {s.label}
          </li>
        ))}
      </ul>
    </section>
  );
}

// "Online 2 h 15 min, asleep 18 h, no data 3 h 45 min", for screen readers.
function summary(d: DayStrip): string {
  const totals = new Map<Presence, number>();
  for (const r of d.runs) totals.set(r.state, (totals.get(r.state) ?? 0) + r.end - r.start);
  const parts = STATES.filter((s) => totals.get(s.state)).map((s) => `${s.label.toLowerCase()} ${formatDuration(totals.get(s.state)! / 1000)}`);
  return `${parts.join(", ")}.`;
}
