import { ChevronRight } from "lucide-react";
import { PeriodLink } from "@/components/home/more-link";
import type { View } from "@/components/stats/periods";
import { energyBySlot, energyIn, spendBySlot, spendIn } from "@/lib/charging-figures";
import { type Change, changeToPrevious, compareToPrevious } from "@/lib/dashboard-summary";
import type { DrivingPeriod } from "@/lib/driving-figures";
import { formatDate, formatShortDate } from "@/lib/format";
import { type Slot, type Timeframe, trackingGap } from "@/lib/periods";
import type { ChargingSession } from "@/lib/server/charging";
import type { StreamChargeSession } from "@/lib/server/stream-charging";
import { barsCaption } from "@/components/stats/chart-caption";
import { type Spark, Sparkline } from "./sparkline";

// Energy used driving, in kWh like every other energy figure.
const oneDecimalKwh = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

const number = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const ARROWS: Record<Change["direction"], string> = { up: "↑", down: "↓", same: "—" };
// The arrow and amount are coloured by meaning, not direction; a change that is neither (more driving,
// more charging, or the same) stays muted. Screen readers hear better or worse in the sentence instead.
const TONES: Record<Change["tone"], string> = { better: "text-chart-better", worse: "text-chart-worse", neutral: "text-muted-foreground" };

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
      {/* The arrow says the tile opens its Stats page; plain figure tiles elsewhere have none. */}
      <p className="flex items-center justify-between gap-2 text-xs font-medium tracking-wide text-faint uppercase">
        <span className="truncate">{label}</span>
        <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 transition-[color,translate] duration-150 group-hover:translate-x-0.5 group-hover:text-foreground" />
      </p>
      <p className="font-mono text-[clamp(1rem,15cqi,1.75rem)] leading-none font-medium tracking-tight whitespace-nowrap tabular-nums">
        {value}
        {unit && <span className="ml-1 text-xs font-normal tracking-normal text-faint">{unit}</span>}
      </p>
      <div className="text-xs leading-5">
        {change ? (
          <>
            <p aria-hidden="true" className="truncate tabular-nums">
              <span className={TONES[change.tone]}>
                {ARROWS[change.direction]} {change.direction === "same" ? "Same" : change.amount}
              </span>
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
  frame,
  driving,
  since,
  now,
  sessions,
  streamOnly,
  chargingSince,
}: {
  // A period or a range picked by date, and the primary car's driving figures for it (null when they
  // couldn't be read); `since` is its first odometer reading.
  frame: Timeframe;
  driving: DrivingPeriod | null;
  since: number | null;
  now: number;
  // Tesla's sessions, and the streamed ones Tesla didn't bill (see matchSessions).
  sessions: ChargingSession[];
  streamOnly: StreamChargeSession[];
  // The first charging session, billed or streamed (see firstStartedAt).
  chargingSince: number | null;
}) {
  const { span, previous: before, slots } = frame;
  const label = frame.previousLabel ?? "";
  // "vs 7 days before", "vs 1–22 Sept".
  const shortLabel = label.replace(/^the /, "");
  // The driving counters already leave out a span they don't cover (see drivingFigures); charging is checked here.
  const chargingTracked = before !== null && chargingSince !== null && chargingSince <= before.from;
  const gap = trackingGap(before, [since, chargingSince]);
  // "18 Oct" this year, "30 Dec 2025" before it.
  const gapText = gap === null ? null : formatDate(gap).slice(-4) === formatDate(now).slice(-4) ? formatShortDate(gap) : formatDate(gap);
  const none = { km: null, whPerKm: null, kwh: null, regenKwh: null };
  const { current, previous, bars } = driving ?? { current: none, previous: null, bars: slots.map(() => none) };

  const spend = spendIn(sessions, span);
  const spendBefore = before && chargingTracked ? spendIn(sessions, before).cost : null;
  const energy = energyIn(sessions, streamOnly, span);
  const energyBefore = before && chargingTracked ? energyIn(sessions, streamOnly, before) : null;
  const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: spend.currency, maximumFractionDigits: 0 });

  const currentSlot = slots.findIndex((slot) => slot.isCurrent);
  // Slots ahead of now (the rest of this year) are drawn empty, not as zero.
  const upToNow = (values: (number | null)[]): (number | null)[] => values.map((v, k) => (slots[k].from > now ? null : v));
  // Each slot's tip: a day by its date ("23 Oct", where a week's bars are labelled by weekday), 3 hours by
  // when they start and end, a month or year by its label; nothing for a slot with nothing known.
  const slotTitle = (slot: Slot, k: number) =>
    frame.slotName === "day" ? formatShortDate(slot.from + 12 * 3_600_000) : frame.slotName === "3 hours" ? `${slot.label} to ${slots[k + 1]?.label ?? "12a"}` : slot.label;
  const spark = (kind: Spark["kind"], values: (number | null)[], format: (n: number) => string): Spark => {
    const shown = upToNow(values);
    return { kind, values: shown, current: currentSlot, tips: shown.map((v, k) => (v === null ? null : { title: slotTitle(slots[k], k), value: format(v) })) };
  };

  // `lowerIsBetter` colours the delta and words the sentence better or worse: "₹171 worse than the 7 days before".
  // Nothing yet this period (no figure, or zero) has nothing to compare, so the delta stays blank.
  const delta = (value: number | null, earlier: number | null, unit: string | ((n: number) => string), lowerIsBetter = false) => ({
    change: !value ? null : changeToPrevious(value, earlier, unit, { lowerIsBetter }),
    sentence: !value ? null : (compareToPrevious(value, earlier, unit, label, { lowerIsBetter })?.text ?? null),
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
            (n) => `${number.format(n)} km`,
          )}
        />
        <Cell
          view="driving"
          label="Energy used"
          value={current.kwh === null ? "—" : oneDecimalKwh.format(current.kwh)}
          unit="kWh"
          {...delta(current.kwh, previous?.kwh ?? null, (n) => `${oneDecimalKwh.format(n)} kWh`)}
          spark={spark(
            "bars",
            bars.map((b) => b.kwh ?? 0),
            (n) => `${oneDecimalKwh.format(n)} kWh`,
          )}
        />
        <Cell
          view="charging"
          label="Energy added"
          value={number.format(energy)}
          unit="kWh"
          {...delta(energy, energyBefore, "kWh")}
          spark={spark("bars", energyBySlot(sessions, streamOnly, slots), (n) => `${number.format(n)} kWh`)}
        />
        <Cell
          view="charging"
          label="Spent"
          value={money.format(spend.cost)}
          {...delta(spend.cost, spendBefore, (n) => money.format(n), true)}
          spark={spark("bars", spendBySlot(sessions, slots), (n) => money.format(n))}
        />
      </div>
      {/* One line in every period, so the strip keeps its height (see ByPeriod's steady). */}
      <p className="text-xs text-muted-foreground">{barsCaption("Small bars: the amount", frame)}. Hover or tap one for its value.</p>
      {gapText && <p className="text-xs text-muted-foreground">Tracking since {gapText} · no earlier period to compare</p>}
    </div>
  );
}
