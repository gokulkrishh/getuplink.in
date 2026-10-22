import { PeriodLink } from "@/components/home/more-link";
import type { View } from "@/components/stats/periods";
import { energyBySlot, energyIn, spendBySlot, spendIn } from "@/lib/charging-figures";
import { type Change, changeToPrevious, compareToPrevious } from "@/lib/dashboard-summary";
import type { DrivingFigures } from "@/lib/driving-figures";
import { formatDate, formatShortDate } from "@/lib/format";
import { type Period, periodSpan, previousLabel, previousSpan, slotsFor, trackingGap } from "@/lib/periods";
import type { ChargingSession } from "@/lib/server/charging";
import type { StreamChargeSession } from "@/lib/server/stream-charging";
import { SLOT_WIDTH, sparkBars, sparkLine } from "@/lib/sparkline";
import { cn } from "@/lib/utils";

const number = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const SPARK_HEIGHT = 24;
const ARROWS: Record<Change["direction"], string> = { up: "↑", down: "↓", same: "—" };

// One value per slot, null where there's nothing to draw. `current` is the slot holding now.
type Spark = { kind: "bars" | "line"; values: (number | null)[]; current: number };

// The period's shape behind the number: bars for totals, a line for a rate. Decorative; the number and
// the delta carry the meaning.
function Sparkline({ kind, values, current }: Spark) {
  const width = values.length * SLOT_WIDTH;
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${width} ${SPARK_HEIGHT}`}
      preserveAspectRatio="none"
      className="block h-6 w-full overflow-visible"
    >
      <line x1={0} x2={width} y1={SPARK_HEIGHT} y2={SPARK_HEIGHT} className="stroke-border" vectorEffect="non-scaling-stroke" />
      {kind === "bars" ? (
        sparkBars(values, SPARK_HEIGHT).map((bar) => (
          <rect
            key={bar.k}
            x={bar.x}
            y={bar.y}
            width={bar.width}
            height={bar.height}
            className={cn(
              "transition-colors duration-150",
              bar.k === current ? "fill-chart-accent" : "fill-muted-foreground/40 group-hover:fill-muted-foreground/60",
            )}
          />
        ))
      ) : (
        <path
          d={sparkLine(values, SPARK_HEIGHT)}
          fill="none"
          strokeWidth={1.25}
          strokeLinejoin="round"
          strokeLinecap="round"
          className="stroke-muted-foreground"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}

// Every cell has the same rows, the delta's two lines kept (blank) when there's no comparison, so the
// strip is one height in every period. The delta lines are for the eye; screen readers get the sentence.
function Cell({
  view,
  label,
  value,
  unit,
  change,
  sentence,
  span,
  spark,
}: {
  view: View;
  label: string;
  value: string;
  unit?: string;
  change: Change | null;
  // compareToPrevious's wording of the same change: "13 km more than the 7 days before".
  sentence: string | null;
  // The span compared with, as the delta's second line shows it.
  span: string;
  spark: Spark;
}) {
  return (
    <PeriodLink
      view={view}
      className="group @container flex min-w-0 flex-col gap-2 bg-background p-3 transition-colors duration-150 hover:bg-muted focus-visible:z-10 focus-visible:outline-offset-[-2px] sm:p-4"
    >
      <p className="truncate text-xs font-medium tracking-wide text-faint uppercase">{label}</p>
      <p className="font-mono text-[clamp(1rem,15cqi,1.75rem)] leading-none font-medium tracking-tight whitespace-nowrap tabular-nums">
        {value}
        {unit && <span className="ml-1 text-xs font-normal tracking-normal text-faint">{unit}</span>}
      </p>
      <div className="text-xs leading-5">
        {change ? (
          <>
            <p aria-hidden="true" className="truncate text-muted-foreground tabular-nums">
              {ARROWS[change.direction]} {change.direction === "same" ? "Same" : change.amount}
              {(change.tone === "better" || change.tone === "worse") && <span className="text-faint"> {change.word}</span>}
            </p>
            <p aria-hidden="true" title={`vs ${span}`} className="truncate text-faint">
              vs {span}
            </p>
            {sentence && <span className="sr-only">{sentence}</span>}
          </>
        ) : (
          <>
            <p aria-hidden="true">&nbsp;</p>
            <p aria-hidden="true">&nbsp;</p>
          </>
        )}
      </div>
      <div className="mt-auto pt-1">
        <Sparkline {...spark} />
      </div>
    </PeriodLink>
  );
}

// The period's four numbers, each against the same span before (see previousSpan). Driving comes from the
// primary car's counters; charging is every session, counted like the Charging page. A comparison needs
// tracking to have begun before that span, or it would compare against part of one: driving tracking
// begins at the first odometer reading, charging at the first session. A cell without a comparison shows
// none, and one line under the strip says since when (see trackingGap). All has nothing to compare with.
// Every period is laid out on home at once (ByPeriod's steady), so the strip keeps one height on a switch.
// Each sparkline is the period's bars (slotsFor), from the same figures the sections below chart.
export function Headline({
  period,
  now,
  figures,
  sessions,
  streamOnly,
  chargingSince,
}: {
  period: Period;
  now: number;
  figures: DrivingFigures;
  // Tesla's sessions, and the streamed ones Tesla didn't bill (see matchSessions).
  sessions: ChargingSession[];
  streamOnly: StreamChargeSession[];
  // The first charging session, billed or streamed (see firstStartedAt).
  chargingSince: number | null;
}) {
  const span = periodSpan(period, now);
  const before = previousSpan(period, now);
  const label = previousLabel(period, now) ?? "";
  // "vs 7 days before", "vs 1–22 Sept".
  const shortLabel = label.replace(/^the /, "");
  // The driving counters already leave out a span they don't cover (see drivingFigures); charging is checked here.
  const chargingTracked = before !== null && chargingSince !== null && chargingSince <= before.from;
  const gap = trackingGap(before, [figures.since, chargingSince]);
  // "18 Oct" this year, "30 Dec 2025" before it.
  const gapText = gap === null ? null : formatDate(gap).slice(-4) === formatDate(now).slice(-4) ? formatShortDate(gap) : formatDate(gap);
  const { current, previous, bars } = figures.periods[period];

  const spend = spendIn(sessions, span);
  const spendBefore = before && chargingTracked ? spendIn(sessions, before).cost : null;
  const energy = energyIn(sessions, streamOnly, span);
  const energyBefore = before && chargingTracked ? energyIn(sessions, streamOnly, before) : null;
  const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: spend.currency, maximumFractionDigits: 0 });

  const slots = slotsFor(period, now);
  const currentSlot = slots.findIndex((slot) => slot.isCurrent);
  // Slots ahead of now (the rest of this year) are drawn empty, not as zero.
  const upToNow = (values: (number | null)[]): (number | null)[] => values.map((v, k) => (slots[k].from > now ? null : v));
  const spark = (kind: Spark["kind"], values: (number | null)[]): Spark => ({ kind, values: upToNow(values), current: currentSlot });

  const delta = (value: number | null, earlier: number | null, unit: string | ((n: number) => string), lowerIsBetter = false) => ({
    change: value === null ? null : changeToPrevious(value, earlier, unit, { lowerIsBetter }),
    sentence: value === null ? null : (compareToPrevious(value, earlier, unit, label, { lowerIsBetter })?.text ?? null),
    span: shortLabel,
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-px border bg-border bg-clip-padding sm:grid-cols-4">
        <Cell
          view="driving"
          label="Driven"
          value={current.km === null ? "—" : number.format(current.km)}
          unit="km"
          {...delta(current.km, previous?.km ?? null, "km")}
          spark={spark(
            "bars",
            bars.map((b) => b.km),
          )}
        />
        <Cell
          view="charging"
          label="Spent"
          value={money.format(spend.cost)}
          {...delta(spend.cost, spendBefore, (n) => money.format(n))}
          spark={spark("bars", spendBySlot(sessions, slots))}
        />
        <Cell
          view="charging"
          label="Energy added"
          value={number.format(energy)}
          unit="kWh"
          {...delta(energy, energyBefore, "kWh")}
          spark={spark("bars", energyBySlot(sessions, streamOnly, slots))}
        />
        <Cell
          view="driving"
          label="Efficiency"
          value={current.whPerKm === null ? "—" : number.format(current.whPerKm)}
          unit="Wh/km"
          {...delta(current.whPerKm, previous?.whPerKm ?? null, "Wh/km", true)}
          spark={spark(
            "line",
            bars.map((b) => b.whPerKm),
          )}
        />
      </div>
      {gapText && <p className="text-xs text-muted-foreground">Tracking since {gapText} · no earlier period to compare</p>}
    </div>
  );
}
