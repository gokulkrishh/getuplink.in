import { Bars } from "@/components/stats/bars";
import { formatShortDate } from "@/lib/format";
import type { DrainSummary } from "@/lib/drives";

const BAR_COUNT = 14;
const MIN_FOR_CHART = 7;

const oneDecimal = (value: number) => (Math.round(value * 10) / 10).toString();

// Battery lost while the car sat parked, per day: the median of the last 30 days' parked stretches of at
// least 6 hours with charging cut out. Shown only with a couple of those; the chart waits for seven.
export function ParkedDrain({ drain }: { drain: DrainSummary | null }) {
  if (!drain) return null;
  const km = drain.kmPerDay !== null && drain.kmPerDay >= 1 ? ` · about ${Math.round(drain.kmPerDay)} km` : "";
  const count = drain.periods.length;
  const recent = drain.periods.slice(-BAR_COUNT);
  const bars = recent.map((p, k) => ({
    key: String(p.start),
    label: formatShortDate(p.end),
    value: p.percentPerDay,
    display: oneDecimal(p.percentPerDay),
    isCurrent: k === recent.length - 1,
  }));
  return (
    <section className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-xs font-medium tracking-wide text-faint uppercase">Parked drain</h2>
        <p className="font-mono text-4xl font-medium tracking-tight tabular-nums">
          {oneDecimal(drain.percentPerDay)}% <span className="text-base font-normal text-muted-foreground">a day{km}</span>
        </p>
        <p className="text-sm text-muted-foreground tabular-nums">Based on {count} nights parked</p>
        <p className="text-xs text-muted-foreground">Sentry Mode, cabin overheat protection and app checks raise this.</p>
      </div>
      {count >= MIN_FOR_CHART && <Bars bars={bars} ariaLabel="Battery lost per day while parked" labelEvery={7} unit="% a day" />}
    </section>
  );
}
