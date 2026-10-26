import type { ReactNode } from "react";
import { ChartCard } from "@/components/chart-card";
import { type Bar, Bars } from "@/components/stats/bars";
import { barsSpan } from "@/components/stats/chart-caption";
import { Figures, Value } from "@/components/stats/figures";
import { type DriveStats } from "@/lib/drive-stats";
import { DRIVE_DAYS, type Drive } from "@/lib/drives";
import { DECIMALS, formatDuration, formatKm, formatKwh, formatNumber, showsZero, sumKnown } from "@/lib/format";
import type { Frame } from "@/lib/frames";
import { inSpan, type Slot } from "@/lib/periods";
import { Measure } from "@/components/measure";

// The Driving page's sections: distance and energy use with regen for the period, and drive stats.

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

// Distance for the period or range, with a bar per slot of it (see Timeframe). With `drives` (the drives
// kept, from `from`), each bar's tip adds how many drives it holds and how long they took, for the bars
// the kept drives cover whole.
export function Distance({ frame, driving, drives }: Pick<Frame, "frame" | "driving"> & { drives?: { list: Drive[]; from: number } }) {
  const description = "Kilometres driven.";
  // The counters couldn't be read for a range picked by date: say so in the chart's place rather than show 0 km.
  if (!driving) return <ChartCard title="Distance" description={description} empty={`Couldn't read the car's counters ${frame.words}.`} />;
  // A period without driving still shows, at 0 km with a note in place of the chart, so picking Day before
  // the first drive of the day doesn't leave a blank gap. A bar with no reading (before tracking began, or
  // ahead of now) is blank, never 0 km; a tracked day without driving is a real 0. The headline is the
  // bars' raw sum (the odometer's rise over the span is the same sum: the bars share their edges).
  const { bars: plain, total } = knownBars(frame.slots, driving.bars.map((b) => b.km), DECIMALS.km);
  const detail = (slot: Slot): string[] => {
    if (!drives || slot.from < drives.from) return [];
    const inSlot = drives.list.filter((d) => inSpan(d.start, slot));
    if (inSlot.length === 0) return [];
    const seconds = inSlot.reduce((sum, d) => sum + (d.end - d.start), 0) / 1000;
    return [`${inSlot.length} ${inSlot.length === 1 ? "drive" : "drives"}`, `${formatDuration(seconds)} driving`];
  };
  const bars = plain.map((b, k) => ({ ...b, tip: detail(frame.slots[k]) }));
  return (
    <ChartCard
      title="Distance"
      description={description}
      caption={barsSpan(frame)}
      // With nothing driven, the empty line says so alone; a 0.0 km headline over it would say it twice.
      summary={hasBars(bars) ? <Headline value={formatKm(total)}>Driven {frame.words}</Headline> : undefined}
      empty={hasBars(bars) ? undefined : `No driving ${frame.words}.`}
    >
      <Bars bars={bars} ariaLabel={`Distance per ${frame.slotName}`} unit="km" labelEvery={frame.labelEvery} fit view="driving" />
    </ChartCard>
  );
}

// One bar from a slot's figure: blank when the figure is unknown (null) or the slot lies ahead of now.
export function knownBar(slot: Slot, value: number | null, format: (n: number) => string): Bar {
  const blank = slot.ahead || value === null;
  return { key: String(slot.id), label: slot.label, axis: slot.axis, edge: slot.edge, days: slot.days, value: blank ? 0 : value, display: blank ? "" : format(value), isCurrent: slot.isCurrent, blank };
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
export function EnergyUse({ frame, driving }: Pick<Frame, "frame" | "driving">) {
  if (!driving) return null;
  const { current, bars: values } = driving;
  // No reading with no driving is nothing used; with driving it's unknown, so the section stays out of the way.
  if ((current.kwh ?? (current.km ? null : 0)) === null) return null;
  const slots = frame.slots;
  // Like the total: no figure with no driving is nothing used, with driving it is unknown and left blank.
  // Each headline is its bars' raw sum (see knownBars).
  const { bars: plain, total: used } = knownBars(slots, values.map((v) => v?.kwh ?? (v?.km === 0 ? 0 : null)), DECIMALS.kWh);
  // Each bar's tip adds its Wh/km, where the bar has one (drives of at least 1 km).
  const bars = plain.map((b, k) => {
    const whPerKm = values[k]?.whPerKm;
    return whPerKm === null || whPerKm === undefined ? b : { ...b, tip: `${formatNumber(whPerKm, DECIMALS.whPerKm)} Wh/km` };
  });
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
          hasBars(bars) ? (
            <Headline value={formatKwh(used)}>
              Used {frame.words}
              {km ? ` · ${formatKm(km)}` : ""}
            </Headline>
          ) : undefined
        }
        empty={hasBars(bars) ? undefined : `No driving ${frame.words}.`}
      >
        <Bars bars={bars} ariaLabel={`Energy used per ${frame.slotName} in kWh`} unit="kWh" labelEvery={frame.labelEvery} fit view="driving" />
      </ChartCard>
      {regenTotal > 0 && (
        <ChartCard
          as="h3"
          title="Regen"
          description="Energy won back as the car slowed."
          unit="kWh"
          terms={["regen"]}
          caption={barsSpan(frame)}
          summary={
            <p className="text-sm">
              Won back <span className="font-mono font-medium tabular-nums"><Measure text={formatKwh(regenTotal)} /></span>{" "}
              <span className="text-muted-foreground">{frame.words}</span>
            </p>
          }
        >
          <Bars bars={regenBars} ariaLabel={`Energy won back by regen per ${frame.slotName} in kWh`} unit="kWh" labelEvery={frame.labelEvery} fit view="driving" />
        </ChartCard>
      )}
    </div>
  );
}

// Drive stats for the period or range, after TeslaMate's: how many drives, how long they usually are, the
// longest, time at the wheel and distance a day. Counted, never projected. `spanDays` is how long the span
// has run; when the stats cover fewer days (tracking began later, or the drives kept stop short), the
// caption says how many. `partial` says the drives reach back only DRIVE_DAYS.
export function DriveStatsSection({ stats, title, spanDays, partial = false }: { stats: DriveStats | null; title: string; spanDays: number; partial?: boolean }) {
  if (!stats) return null;
  const covers = `${Math.max(1, Math.round(stats.days))} ${Math.round(stats.days) === 1 ? "day" : "days"}`;
  const short = Math.round(stats.days) < Math.round(spanDays);
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
          {short ? `${title}, ${covers}` : title}.
        </p>
        {partial && <p className="text-sm text-faint">Drives cover only the last {DRIVE_DAYS} days.</p>}
      </div>
      {/* Tiles: easier to take in than a long list. */}
      <Figures figures={figures} />
    </section>
  );
}
