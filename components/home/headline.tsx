import type { ReactNode } from "react";
import { ChevronRight, Moon, Sunrise } from "lucide-react";
import { fitFont } from "@/components/measure";
import { MoreLink } from "@/components/more-link";
import { PeriodLink } from "@/components/home/more-link";
import { barOpens } from "@/components/stats/bar-parts";
import { statsHref, type View } from "@/components/stats/periods";
import { type Bill, billsBySlot, billsIn, energyBySlot, energyIn } from "@/lib/charging-figures";
import { type Change, changeToPrevious, compareToPrevious, hasNoHistory } from "@/lib/dashboard-summary";
import type { DrivingPeriod } from "@/lib/driving-figures";
import { DECIMALS, formatDate, formatKm, formatKwh, formatMoney, formatNumber, formatShortDate, showsZero, sumKnown } from "@/lib/format";
import { fromTracking, type Slot, type Timeframe, trackingGap } from "@/lib/periods";
import type { ChargingSession } from "@/lib/server/charging";
import type { StreamChargeSession } from "@/lib/server/stream-charging";
import { cn } from "@/lib/utils";
import { type Spark, Sparkline } from "./sparkline";

// The change says its direction in words ("22 km more", "3 kWh less"), never a sign or an arrow, so colour
// is never the only signal. It is coloured only where up or down is clearly good or bad (spending); more
// driving, more charging or the same stays muted. Screen readers hear the whole sentence instead.
const TONES: Record<Change["tone"], string> = { better: "text-chart-better", worse: "text-chart-worse", neutral: "text-muted-foreground" };

// Every cell has the same rows, the delta's two lines kept (blank) when there's no comparison, so the
// strip is one height in every period. The delta lines are for the eye; screen readers get the sentence.
// With `empty`, the cell says only that ("None today") where the number would be: no zero, no delta, no
// sparkline note.
function Cell({
  view,
  label,
  value,
  unit,
  empty,
  change,
  sentence,
  span,
  spark,
  tone,
}: {
  view: View;
  label: string;
  value: string;
  unit?: string;
  // "—": the one thing the cell says when it has no figure.
  empty: string | null;
  change: Change | null;
  // compareToPrevious's wording of the same change: "13 km more than the 7 days before".
  sentence: string | null;
  // The span compared with, as the delta's second line shows it.
  span: string;
  spark: Spark;
  tone?: "charge" | "use";
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
      {empty ? (
        // Sits on the number's baseline, so the row lines up with a tile that has one.
        <p className={cn("flex min-h-7 items-end leading-none", empty === "—" ? "font-mono text-[1.75rem] text-faint" : "text-sm text-muted-foreground")}>{empty}</p>
      ) : (
        <p className="font-mono leading-none font-medium tracking-tight whitespace-nowrap tabular-nums" style={fitFont(unit ? `${value} ${unit}` : value)}>
          {value}
          {unit && <span className="ml-1 text-xs font-normal tracking-normal text-faint">{unit}</span>}
        </p>
      )}
      <div className="text-xs leading-5">
        {change && !empty ? (
          <>
            {/* Wraps rather than cut: the word "more" or "less" is the direction, so it must always show. */}
            <p aria-hidden="true" className="tabular-nums">
              <span className={TONES[change.tone]}>
                {change.direction === "same" ? "Same" : `${change.amount} ${change.direction === "up" ? "more" : "less"}`}
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
      <div className="mt-auto pt-1">{empty ? <div aria-hidden="true" className="h-6" /> : <Sparkline {...spark} tone={tone} />}</div>
    </PeriodLink>
  );
}

// A week with nothing to total, as one card: an icon, what it is, one line, and a way on. On a phone the
// parts stack, so the text has the card's whole width; from sm up they sit in a row.
function QuietCard({ icon, title, action, children }: { icon: ReactNode; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 border px-5 py-6 sm:flex-row sm:items-center sm:gap-4 dark:border-transparent dark:bg-card">
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">{icon}</span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{children}</p>
      </div>
      {action}
    </div>
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
  lastReadingAt,
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
  // The primary car's newest reading, null for none, undefined when it couldn't be read (see hasNoHistory).
  lastReadingAt: string | null | undefined;
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
  const figure = (
    values: (number | null)[],
    whole: number | null,
    decimals: number,
    format: (n: number) => string,
    skip: number,
    view: View,
  ): { value: number | null; spark: Spark } => {
    const parts = upToNow(values);
    const known = parts.some((v) => v !== null);
    const shown = parts.slice(skip);
    return {
      value: whole === null ? null : known ? sumKnown(parts) : whole,
      spark: {
        kind: "bars",
        // A slot that shows as zero draws no bar and has no tip (see showsZero).
        values: shown.map((v) => (v !== null && showsZero(format(v)) ? 0 : v)),
        current: currentSlot < 0 ? -1 : currentSlot - skip,
        tips: shown.map((v, k) => (v === null || showsZero(format(v)) ? null : { title: slotTitle(slots[k + skip]), value: format(v) })),
        // A bar with a figure opens its days on the tile's Stats page, as the Stats charts' bars do.
        opens: shown.map((v, k) => (v === null || showsZero(format(v)) ? null : (barOpens(slots[k + skip].days, view)?.href ?? null))),
      },
    };
  };
  const driven = figure(
    bars.map((b) => b.km),
    current.km,
    DECIMALS.km,
    formatKm,
    driveSkip,
    "driving",
  );
  // Like the Driving page: no figure with no driving is nothing used, with driving it is unknown.
  const used = figure(
    bars.map((b) => b.kwh ?? (b.km === 0 ? 0 : null)),
    current.kwh,
    DECIMALS.kWh,
    formatKwh,
    driveSkip,
    "driving",
  );
  const added = figure(charged(energyBySlot(sessions, streamOnly, slots)), energy, DECIMALS.kWh, formatKwh, chargeSkip, "charging");
  const spent = figure(charged(billsBySlot(bills, slots)), spend, DECIMALS.money, money, chargeSkip, "charging");

  // `lowerIsBetter` colours the delta and words the sentence better or worse: "₹171 worse than the 7 days before".
  // Nothing yet this period (no figure, or zero) has nothing to compare, so the delta stays blank. The change
  // is rounded to the figure's own precision, so "+22.4 km" sits under "100.0 km".
  const delta = (value: number | null, earlier: number | null, unit: (n: number) => string, decimals: number, lowerIsBetter = false) => ({
    change: !value ? null : changeToPrevious(value, earlier, unit, { lowerIsBetter, decimals }),
    sentence: !value ? null : (compareToPrevious(value, earlier, unit, label, { lowerIsBetter, decimals })?.text ?? null),
    span: shortLabel,
  });
  const number = (decimals: number) => (n: number | null) => (n === null ? "" : formatNumber(n, decimals));
  // A cell with no figure, read or not, shows a grey "—": nothing to show for the week.
  const emptyWords = (n: number | null, decimals: number) => (n === null || showsZero(formatNumber(n, decimals)) ? "—" : null);
  const quietWeek = [driven.value, used.value, added.value, spent.value].every((v) => v === null || v === 0);

  // A car that has sent nothing yet is getting started, not having a quiet week.
  if (hasNoHistory(since, chargingSince, lastReadingAt))
    return (
      <QuietCard icon={<Sunrise className="size-5" aria-hidden="true" />} title="Just getting started">
        Go for a drive or plug in, and it shows up here.
      </QuietCard>
    );

  // A week with no driving and no charging is one card, not four empty tiles.
  if (quietWeek)
    return (
      <QuietCard
        icon={<Moon className="size-5" aria-hidden="true" />}
        title="A quiet week"
        // The way to something that did happen: the month on Stats.
        action={<MoreLink href={statsHref("driving", "month")} className="shrink-0">This month</MoreLink>}
      >
        No driving or charging in the last 7 days.{gapText && ` Tracking since ${gapText}.`}
      </QuietCard>
    );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-px border bg-border bg-clip-padding dark:border-transparent dark:bg-background sm:grid-cols-4">
        <Cell
          view="driving"
          label="Driven"
          value={number(DECIMALS.km)(driven.value)}
          unit="km"
          empty={emptyWords(driven.value, DECIMALS.km)}
          {...delta(driven.value, previous?.km ?? null, formatKm, DECIMALS.km)}
          spark={driven.spark}
        />
        <Cell
          view="driving"
          label="Energy used"
          tone="use"
          value={number(DECIMALS.kWh)(used.value)}
          unit="kWh"
          empty={emptyWords(used.value, DECIMALS.kWh)}
          {...delta(used.value, previous?.kwh ?? null, formatKwh, DECIMALS.kWh)}
          spark={used.spark}
        />
        <Cell
          view="charging"
          label="Energy added"
          tone="charge"
          value={number(DECIMALS.kWh)(added.value)}
          unit="kWh"
          empty={emptyWords(added.value, DECIMALS.kWh)}
          {...delta(added.value, energyBefore, formatKwh, DECIMALS.kWh)}
          spark={added.spark}
        />
        <Cell
          view="charging"
          label="Spent"
          value={money(spent.value ?? 0)}
          empty={emptyWords(spent.value, DECIMALS.money)}
          {...delta(spent.value, spendBefore, money, DECIMALS.money, true)}
          spark={spent.spark}
        />
      </div>
    </div>
  );
}
