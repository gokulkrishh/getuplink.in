import { ChevronRight } from "lucide-react";
import { fitFont } from "@/components/measure";
import { PeriodLink } from "@/components/home/more-link";
import type { View } from "@/components/stats/periods";
import { type Bill, billsBySlot, billsIn, energyBySlot, energyIn } from "@/lib/charging-figures";
import { type Change, changeToPrevious, compareToPrevious } from "@/lib/dashboard-summary";
import type { DrivingPeriod } from "@/lib/driving-figures";
import { DECIMALS, formatDate, formatKm, formatKwh, formatMoney, formatNumber, formatShortDate, showsZero, sumKnown } from "@/lib/format";
import { fromTracking, type Slot, type Timeframe, trackingGap } from "@/lib/periods";
import type { ChargingSession } from "@/lib/server/charging";
import type { StreamChargeSession } from "@/lib/server/stream-charging";
import { type Spark, Sparkline } from "./sparkline";

// The change carries its sign in the text ("+22 km", "−3 kWh"), never an arrow. It is coloured by meaning,
// not direction; a change that is neither (more driving, more charging, or the same) stays muted. Screen
// readers hear better or worse in the sentence instead.
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
      className="group @container flex min-w-0 flex-col gap-2 bg-background p-3 transition-colors dark:bg-card duration-150 hover:bg-muted focus-visible:z-10 focus-visible:outline-offset-[-2px] sm:p-4"
    >
      {/* The arrow says the tile opens its Stats page; plain figure tiles elsewhere have none. */}
      <p className="flex items-center justify-between gap-2 text-[0.8125rem] text-muted-foreground">
        <span className="truncate">{label}</span>
        <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 transition-[color,translate] duration-150 group-hover:translate-x-0.5 group-hover:text-foreground" />
      </p>
      <p className="font-mono leading-none font-medium tracking-tight whitespace-nowrap tabular-nums" style={fitFont(unit ? `${value} ${unit}` : value)}>
        {value}
        {unit && <span className="ml-1 text-xs font-normal tracking-normal text-faint">{unit}</span>}
      </p>
      <div className="text-xs leading-5">
        {change ? (
          <>
            <p aria-hidden="true" className="truncate tabular-nums">
              <span className={TONES[change.tone]}>
                {change.direction === "same" ? "Same" : `${change.direction === "up" ? "+" : "−"}${change.amount}`}
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
  bills,
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
  // Every real bill: Tesla's and the invoices attached (see chargingBills), as Charging counts spend.
  bills: Bill[];
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

  const spend = billsIn(bills, span).cost;
  const spendBefore = before && chargingTracked ? billsIn(bills, before).cost : null;
  const energy = energyIn(sessions, streamOnly, span);
  const energyBefore = before && chargingTracked ? energyIn(sessions, streamOnly, before) : null;
  const currency = sessions.find((s) => s.currency)?.currency ?? "INR";
  const money = (n: number) => formatMoney(n, currency);

  const currentSlot = slots.findIndex((slot) => slot.isCurrent);
  // Slots ahead of now (the rest of this year) are drawn empty, not as zero.
  const upToNow = (values: (number | null)[]): (number | null)[] => values.map((v, k) => (slots[k].ahead ? null : v));
  // Charging is known from its first session on: a slot that ends before it is empty, not ₹0 or 0 kWh.
  const charged = (values: number[]): (number | null)[] => values.map((v, k) => (chargingSince === null || slots[k].to <= chargingSince ? null : v));
  // Each slot's tip: a day by its date ("23 Oct", where a week's bars are labelled by weekday); 3 hours,
  // a month or a year by its label, which for hours is their whole span ("6 AM to 9 AM"); nothing for a
  // slot with nothing known.
  const slotTitle = (slot: Slot) => (frame.slotName === "day" ? formatShortDate(slot.from + 12 * 3_600_000) : slot.label);
  // Each sparkline starts at its own data's first day (see fromTracking): driving at the first odometer
  // reading, charging at the first session. `skip` is how many bars before it are left out of the drawing;
  // nothing was read in them, so the number is the same.
  const driveSkip = fromTracking(frame, since, now).skip;
  const chargeSkip = fromTracking(frame, chargingSince, now).skip;
  // A cell's number and its sparkline's tips, from the same values: the number is the bars' raw sum (they
  // cover the span, so it is the span's figure), and each is rounded on its own when shown. With no bar
  // known, the span's own figure (`whole`) stands, or none.
  const figure = (values: (number | null)[], whole: number | null, decimals: number, format: (n: number) => string, skip: number): { value: number | null; spark: Spark } => {
    const parts = upToNow(values);
    const known = parts.some((v) => v !== null);
    const shown = parts.slice(skip);
    return {
      value: whole === null ? null : known ? sumKnown(parts) : whole,
      spark: {
        kind: "bars",
        // A slot whose tip reads "0.0 km" draws no bar (see showsZero).
        values: shown.map((v) => (v !== null && showsZero(format(v)) ? 0 : v)),
        current: currentSlot < 0 ? -1 : currentSlot - skip,
        tips: shown.map((v, k) => (v === null ? null : { title: slotTitle(slots[k + skip]), value: format(v) })),
      },
    };
  };
  const driven = figure(
    bars.map((b) => b.km),
    current.km,
    DECIMALS.km,
    formatKm,
    driveSkip,
  );
  // Like the Driving page: no figure with no driving is nothing used, with driving it is unknown.
  const used = figure(
    bars.map((b) => b.kwh ?? (b.km === 0 ? 0 : null)),
    current.kwh,
    DECIMALS.kWh,
    formatKwh,
    driveSkip,
  );
  const added = figure(charged(energyBySlot(sessions, streamOnly, slots)), energy, DECIMALS.kWh, formatKwh, chargeSkip);
  const spent = figure(charged(billsBySlot(bills, slots)), spend, DECIMALS.money, money, chargeSkip);

  // `lowerIsBetter` colours the delta and words the sentence better or worse: "₹171 worse than the 7 days before".
  // Nothing yet this period (no figure, or zero) has nothing to compare, so the delta stays blank. The change
  // is rounded to the figure's own precision, so "+22.4 km" sits under "100.0 km".
  const delta = (value: number | null, earlier: number | null, unit: (n: number) => string, decimals: number, lowerIsBetter = false) => ({
    change: !value ? null : changeToPrevious(value, earlier, unit, { lowerIsBetter, decimals }),
    sentence: !value ? null : (compareToPrevious(value, earlier, unit, label, { lowerIsBetter, decimals })?.text ?? null),
    span: shortLabel,
  });
  const number = (decimals: number) => (n: number | null) => (n === null ? "—" : formatNumber(n, decimals));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-px border bg-border bg-clip-padding dark:border-transparent dark:bg-background sm:grid-cols-4">
        <Cell
          view="driving"
          label="Driven"
          value={number(DECIMALS.km)(driven.value)}
          unit="km"
          {...delta(driven.value, previous?.km ?? null, formatKm, DECIMALS.km)}
          spark={driven.spark}
        />
        <Cell
          view="driving"
          label="Energy used"
          value={number(DECIMALS.kWh)(used.value)}
          unit="kWh"
          {...delta(used.value, previous?.kwh ?? null, formatKwh, DECIMALS.kWh)}
          spark={used.spark}
        />
        <Cell
          view="charging"
          label="Energy added"
          value={number(DECIMALS.kWh)(added.value)}
          unit="kWh"
          {...delta(added.value, energyBefore, formatKwh, DECIMALS.kWh)}
          spark={added.spark}
        />
        <Cell
          view="charging"
          label="Spent"
          value={money(spent.value ?? 0)}
          {...delta(spent.value, spendBefore, money, DECIMALS.money, true)}
          spark={spent.spark}
        />
      </div>
      {/* One line in every period, so the strip keeps its height (see ByPeriod's steady). */}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {gapText && <span>Tracking since {gapText}</span>}
      </p>
    </div>
  );
}
