import { ChartCard } from "@/components/chart-card";
import { AwakeStrip } from "@/components/stats/awake-strip";
import { awakeSentence, type DayStrip, hasPresence, type Presence, runLabel } from "@/lib/awake";
import { formatDayLabel, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATES: { state: Presence; label: string; className: string }[] = [
  { state: "online", label: "Awake", className: "bg-chart-accent" },
  { state: "asleep", label: "Asleep", className: "bg-muted-foreground/30" },
  { state: "offline", label: "Out of reach", className: "bg-muted-foreground/70" },
  // Hollow with a hairline, like its legend square, so a day with no data can't pass for asleep.
  { state: "unknown", label: "No data", className: "border border-muted-foreground/25" },
];
const classes = Object.fromEntries(STATES.map((s) => [s.state, s.className])) as Record<Presence, string>;

// A thin strip per IST day for the last 14 days, newest on top: when the car was online, asleep or
// offline. Updates only download while it's awake, so this answers "why hasn't it arrived yet?". The
// strips start at the first day with any data, so days before tracking began aren't drawn as "No data".
export function AwakeTimeline({ days: all, now }: { days: DayStrip[]; now: number }) {
  if (!hasPresence(all)) return null;
  const first = all.findIndex((d) => d.runs.some((r) => r.state !== "unknown"));
  const days = first > 0 ? all.slice(first) : all;
  const onlineDays = days.filter((d) => d.runs.some((r) => r.state === "online")).length;
  // "since 23 Oct" when tracking began inside the last 14 days.
  const sentence = awakeSentence(onlineDays, days.length, first > 0 ? formatShortDate(days[0].start + 43_200_000) : null);
  // One day is a sentence, not a chart of one bar.
  if (days.length === 1) {
    return <ChartCard title="Awake and asleep" description="When the car was awake each day. Updates download only then." empty={sentence} />;
  }
  return (
    <ChartCard title="Awake and asleep" description="When the car was awake each day. Updates download only then." summary={<p className="text-sm tabular-nums">{sentence}</p>}>
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

// What was seen that day, for screen readers: "Awake · 8:12 AM. Asleep · 2:00 PM."
function summary(d: DayStrip): string {
  const seen = d.runs.filter((r) => r.state !== "unknown");
  return seen.length ? `${seen.map(runLabel).join(". ")}.` : "No data.";
}
