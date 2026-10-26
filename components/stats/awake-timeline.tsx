import { ChartCard } from "@/components/chart-card";
import { AwakeStrip } from "@/components/stats/awake-strip";
import { type DayStrip, hasPresence, type Presence, runLabel } from "@/lib/awake";
import { formatDayLabel } from "@/lib/format";
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
  const onlineDays = days.filter((d) => d.runs.some((r) => r.state === "online")).length;
  return (
    <ChartCard
      title="Online and asleep"
      description="When the car was awake each day. Updates download only then."
      info={
        <>
          <p>Newest day on top. Long asleep stretches can explain a late update.</p>
          <p>
            The car doesn&apos;t say when it wakes or sleeps, so each mark is a 15-minute block where it sent data, or where a check every 6 hours found
            it asleep or offline.
          </p>
        </>
      }
      summary={
        <p className="text-sm tabular-nums">
          Online on {onlineDays} of the last {days.length} days
        </p>
      }
    >
      <div className="space-y-3">
        <div className="space-y-3 bg-muted dark:bg-card px-3 pt-4 pb-3">
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
      </div>
    </ChartCard>
  );
}

// What was seen that day, for screen readers: "Online · 8:12 AM. Asleep · 2:00 PM."
function summary(d: DayStrip): string {
  const seen = d.runs.filter((r) => r.state !== "unknown");
  return seen.length ? `${seen.map(runLabel).join(". ")}.` : "No data.";
}
