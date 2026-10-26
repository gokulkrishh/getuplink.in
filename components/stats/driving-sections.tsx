import type { ReactNode } from "react";
import { ChartCard } from "@/components/chart-card";
import { type Bar, Bars } from "@/components/stats/bars";
import { barsSpan } from "@/components/stats/chart-caption";
import { Figures, Value } from "@/components/stats/figures";
import { type DriveStats } from "@/lib/drive-stats";
import { DRIVE_DAYS } from "@/lib/drives";
import { DECIMALS, formatDuration, formatKm, formatKwh, formatNumber, formatShortDate, showsZero, sumKnown } from "@/lib/format";
import type { Frame } from "@/lib/frames";
import { inSpan, type Slot, type Timeframe } from "@/lib/periods";
import type { DayKm } from "@/lib/telemetry-derive";
import { Measure } from "@/components/measure";

// The Driving page's sections: distance per month and per day, and energy use with regen.

const compactNumber = new Intl.NumberFormat("en-IN");

// The big number above a chart, and the line under it saying what it covers.
function Headline({ value, children }: { value: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="font-mono text-4xl font-medium tracking-tight tabular-nums">
        <Value text={value} />
      </p>
      <p className="text-sm text-muted-foreground tabular-nums">{children}</p>
    </div>
  );
}

// Distance for the period or range, with a bar per slot of it (see Timeframe).
export function Distance({ frame, driving }: Frame) {
  const description = "Kilometres driven.";
  // The counters couldn't be read for a range picked by date: say so in the chart's place rather than show 0 km.
  if (!driving) return <ChartCard title="Distance" description={description} empty={`Couldn't read the car's counters ${frame.words}`} />;
  // A period without driving still shows, at 0 km with a note in place of the chart, so picking Day before
  // the first drive of the day doesn't leave a blank gap. A bar with no reading (before tracking began, or
  // ahead of now) is blank, never 0 km; a tracked day without driving is a real 0. The headline is the
  // bars' raw sum (the odometer's rise over the span is the same sum: the bars share their edges).
  const { bars, total } = knownBars(frame.slots, driving.bars.map((b) => b.km), DECIMALS.km);
  return (
    <ChartCard
      title="Distance"
      description={description}
      caption={barsSpan(frame)}
      summary={<Headline value={formatKm(total)}>Driven {frame.words}</Headline>}
      empty={hasBars(bars) ? undefined : `No driving ${frame.words}`}
    >
      <Bars bars={bars} ariaLabel={`Distance per ${frame.slotName}`} unit="km" labelEvery={frame.labelEvery} fit />
    </ChartCard>
  );
}

// One bar from a slot's figure: blank when the figure is unknown (null) or the slot lies ahead of now.
export function knownBar(slot: Slot, value: number | null, format: (n: number) => string): Bar {
  const blank = slot.ahead || value === null;
  return { key: String(slot.id), label: slot.label, axis: slot.axis, edge: slot.edge, value: blank ? 0 : value, display: blank ? "" : format(value), isCurrent: slot.isCurrent, blank };
}

// A bar per slot and their total, from the same values: the total is their raw sum (see sumKnown). Each bar
// and the total are rounded on their own when shown, so a bar reads the same digits as the same figure
// anywhere else, and the shown bars can add up to a last digit off the shown total.
export function knownBars(
  slots: Slot[],
  values: (number | null)[],
  decimals: number,
  format: (n: number) => string = (n) => formatNumber(n, decimals),
): { bars: Bar[]; total: number } {
  const known = slots.map((slot, k) => (slot.ahead ? null : (values[k] ?? null)));
  return { bars: slots.map((slot, k) => knownBar(slot, known[k], format)), total: sumKnown(known) };
}

// Whether a bar chart has anything to draw; without, its card shows a note in the chart's place.
// A bar that shows as 0.0 draws nothing (see showsZero), so it doesn't count.
export const hasBars = (bars: Bar[]) => bars.some((b) => b.value > 0 && !showsZero(b.display));

// Energy used driving in the period and each bar, in kWh: from the streamed lifetime energy counter, or
// from the drives where the counter has no reading from before the span (see withDriveEfficiency). Then
// what regen won back, when it won any.
export function EnergyUse({ frame, driving }: Frame) {
  if (!driving) return null;
  const { current, bars: values } = driving;
  // No reading with no driving is nothing used; with driving it's unknown, so the section stays out of the way.
  if ((current.kwh ?? (current.km ? null : 0)) === null) return null;
  const slots = frame.slots;
  // Like the total: no figure with no driving is nothing used, with driving it is unknown and left blank.
  // Each headline is its bars' raw sum (see knownBars).
  const { bars, total: used } = knownBars(slots, values.map((v) => v?.kwh ?? (v?.km === 0 ? 0 : null)), DECIMALS.kWh);
  const { bars: regenBars, total: regenTotal } = knownBars(slots, values.map((v) => v?.regenKwh ?? null), DECIMALS.kWh);
  const km = sumKnown(values.map((v) => v?.km));
  return (
    <div className="space-y-12">
      <ChartCard
        title="Energy use"
        description="Energy the car used driving."
        unit="kWh"
        caption={barsSpan(frame)}
        summary={
          <Headline value={formatKwh(used)}>
            Used {frame.words}
            {km ? ` · ${formatKm(km)}` : ""}
          </Headline>
        }
        empty={hasBars(bars) ? undefined : `No driving ${frame.words}`}
      >
        <Bars bars={bars} ariaLabel={`Energy used per ${frame.slotName} in kWh`} unit="kWh" labelEvery={frame.labelEvery} fit />
      </ChartCard>
      {regenTotal > 0 && (
        <ChartCard
          as="h3"
          title="Regen"
          description="Energy won back as the car slowed."
          unit="kWh"
          terms={["regen"]}
          info="It goes back into the battery, making up for part of the energy used."
          caption={barsSpan(frame)}
          summary={
            <p className="text-sm">
              Won back <span className="font-mono font-medium tabular-nums"><Measure text={formatKwh(regenTotal)} /></span>{" "}
              <span className="text-muted-foreground">{frame.words}</span>
            </p>
          }
        >
          <Bars bars={regenBars} ariaLabel={`Energy won back by regen per ${frame.slotName} in kWh`} unit="kWh" labelEvery={frame.labelEvery} fit />
        </ChartCard>
      )}
    </div>
  );
}

const upper = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

// The phone shows the last PHONE_DAYS of a longer run of days, so its bars stay wide enough to tap.
const PHONE_DAYS = 30;

// Kilometres per day for the last 90 days, from the streamed odometer, squeezed to fit the panel: all of
// them on a wide screen, the last 30 on a phone. It starts at the first day with a reading, so four days
// of tracking draw four bars, and says "since 23 Oct". With `frame` (a range picked by date), only its
// days, and a note when it starts before the kept days.
export function DailyDriving({ days: all, frame, partial = false }: { days: DayKm[]; frame?: Timeframe; partial?: boolean }) {
  const inFrame = frame ? all.filter((d) => inSpan(d.start, frame.span)) : all;
  const first = inFrame.findIndex((d) => d.km !== null);
  const days = first < 0 ? [] : inFrame.slice(first);
  // One day of readings has nothing to compare against, so the section waits for a second.
  if (days.filter((d) => d.km !== null).length < 2) return null;
  // Cut short at the first reading: the days start later than the window or the range does.
  const since = first > 0 ? `since ${formatShortDate(days[0].start)}` : null;
  const bars = days.map((d, k) => ({
    key: String(d.day),
    label: formatShortDate(d.start),
    value: d.km ?? 0,
    display: formatNumber(d.km ?? 0, DECIMALS.km),
    isCurrent: k === days.length - 1,
    blank: d.km === null,
  }));
  const split = bars.length > PHONE_DAYS;
  // The words for every day drawn: "since 23 Oct" when cut short, the range's own words, or the window.
  const whole = since ?? (frame ? frame.words : `last ${days.length} days`);
  // A picked range may end before today, so its phone bars are named by their own dates.
  const phoneSpan = frame ? `${bars[bars.length - PHONE_DAYS]?.label} to ${bars[bars.length - 1].label}` : `last ${PHONE_DAYS} days`;
  // Few days need little thinning: every label up to a week, every other up to two.
  const every = (n: number) => (n <= 7 ? 1 : n <= 14 ? 2 : 7);
  // The total line counts the same days the caption names, on a phone as on a wide screen: the raw sum
  // of those days (see sumKnown).
  const total = (list: DayKm[], words: string) =>
    `${formatKm(sumKnown(list.map((d) => d.km)))} ${words.startsWith("last") ? `in the ${words}` : /^\d/.test(words) ? `from ${words}` : words}`;
  return (
    <ChartCard
      title="Driving per day"
      description="Kilometres driven each day."
      info="A day without an odometer reading is left blank."
      summary={
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground tabular-nums">
            {split ? (
              <>
                <span className="max-sm:hidden">{total(days, whole)}</span>
                <span className="sm:hidden">{total(days.slice(-PHONE_DAYS), phoneSpan)}</span>
              </>
            ) : (
              total(days, whole)
            )}
          </p>
          {partial && <p className="text-xs text-faint">Days cover only the last {all.length} days.</p>}
        </div>
      }
      caption={
        split ? (
          <>
            <span className="max-sm:hidden">{upper(whole)}</span>
            <span className="sm:hidden">{upper(phoneSpan)}</span>
          </>
        ) : (
          upper(whole)
        )
      }
    >
      {split ? (
        <>
          <div className="max-sm:hidden">
            <Bars bars={bars} ariaLabel="Distance per day" labelEvery={7} unit="km" fit />
          </div>
          <div className="sm:hidden">
            <Bars bars={bars.slice(-PHONE_DAYS)} ariaLabel="Distance per day" labelEvery={7} unit="km" fit />
          </div>
        </>
      ) : (
        <Bars bars={bars} ariaLabel="Distance per day" labelEvery={every(bars.length)} unit="km" fit />
      )}
    </ChartCard>
  );
}

// Drive stats for the last 90 days (or since tracking began), after TeslaMate's: how many drives, how
// long they usually are, the longest, time at the wheel and distance a day. Counted, never projected.
// With `title` (a range picked by date), it names the range instead, and `partial` says the drives reach
// back only DRIVE_DAYS.
export function DriveStatsSection({ stats, title, partial = false }: { stats: DriveStats | null; title?: string; partial?: boolean }) {
  if (!stats) return null;
  const covers = `${Math.max(1, Math.round(stats.days))} ${Math.round(stats.days) === 1 ? "day" : "days"}`;
  const figures = [
    { label: "Distance", value: formatKm(stats.km) },
    { label: "Trips", value: compactNumber.format(stats.trips), note: `${compactNumber.format(stats.drives)} ${stats.drives === 1 ? "drive" : "drives"}` },
    { label: "Typical drive", value: formatKm(stats.medianKm), note: "The median" },
    { label: "Longest drive", value: formatKm(stats.longestKm) },
    { label: "Time driving", value: formatDuration(stats.hours * 3600) },
    { label: "Per day", value: formatKm(stats.kmPerDay), note: "On average" },
  ];
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-medium tracking-heading">Drive stats</h2>
        <p className="text-sm text-muted-foreground">
          {title ? `${title}, ${covers}` : stats.days >= 89 ? "Last 90 days" : `Since tracking began, ${covers}`}.
        </p>
        {partial && <p className="text-xs text-faint">Drives cover only the last {DRIVE_DAYS} days.</p>}
      </div>
      {/* Tiles: easier to take in than a long list. */}
      <Figures figures={figures} />
    </section>
  );
}
