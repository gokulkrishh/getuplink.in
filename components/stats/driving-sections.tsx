import type { Stops } from "@/lib/bar-stops";
import type { TipRow } from "@/components/stats/bar-parts";
import type { ReactNode } from "react";
import { ChartCard } from "@/components/chart-card";
import { type Bar, Bars } from "@/components/stats/bars";
import { barsSpan } from "@/components/stats/chart-caption";
import { Figures, Value } from "@/components/stats/figures";
import { comparedWith, headline } from "@/lib/dashboard-summary";
import { type DriveStats } from "@/lib/drive-stats";
import { DRIVE_DAYS } from "@/lib/drives";
import type { DrivingFigure, DrivingPeriod } from "@/lib/driving-figures";
import { DECIMALS, formatDuration, formatKm, formatKwh, formatNumber, showsZero, sumKnown } from "@/lib/format";
import type { Frame } from "@/lib/frames";
import type { Slot } from "@/lib/periods";

// The Driving page's sections: distance for the period, with the energy it took under the chart, and drive stats.

const compactNumber = new Intl.NumberFormat("en-IN");

// The big number above a chart, and one sentence under it saying what it covers and how it compares with
// the span before (see headline): "Driven in the last 7 days, 21.7 km more than the 7 days before."
export function Headline({ value, children }: { value: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="font-mono text-4xl font-medium tracking-tight tabular-nums">
        <Value text={value} />
      </p>
      <p className="text-sm text-muted-foreground tabular-nums">{children}</p>
    </div>
  );
}

// Distance for the period or range, with a bar per slot of it (see Timeframe), and the energy it took: each
// bar's tip adds its kWh and Wh/km (see energyLines), and the one line under the chart sums the period's
// energy and regen (see energyCaption). One chart says what three (Distance, Energy use, Regen) did.
export function Distance({ frame, driving, stops }: Pick<Frame, "frame" | "driving"> & { stops: Stops }) {
  // The counters couldn't be read for a range picked by date: say so in the chart's place rather than show 0 km.
  if (!driving) return <ChartCard title="Distance" empty={"Couldn't read the car's counters."} />;
  // A period without driving still shows, at 0 km with a note in place of the chart, so picking Day before
  // the first drive of the day doesn't leave a blank gap. A bar with no reading (before tracking began, or
  // ahead of now) is blank, never 0 km; a tracked day without driving is a real 0. The headline is the
  // bars' raw sum (the odometer's rise over the span is the same sum: the bars share their edges).
  const { bars: plain, total } = knownBars(frame.slots, driving.bars.map((b) => b.km), DECIMALS.km);
  const bars = plain.map((b, k) => ({ ...b, tip: energyLines(driving.bars[k]) }));
  // Against the span before, where the counters covered it (see DrivingPeriod.previous).
  const compared = comparedWith(total, driving.previous?.km ?? null, "km", frame.previousLabel, { decimals: DECIMALS.km });
  return (
    <ChartCard
      title="Distance"
      // The energy line is the chart's one caption; without an energy reading, the bars' span is.
      caption={energyCaption(driving, frame.previousLabel) ?? barsSpan(frame)}
      // With nothing driven, the empty line says so alone; a 0.0 km headline over it would say it twice.
      summary={hasBars(bars) ? <Headline value={formatKm(total)}>{headline("Driven", compared)}</Headline> : undefined}
      empty={hasBars(bars) ? undefined : "No driving."}
    >
      <Bars bars={bars} valueLabel="Distance" ariaLabel={`Distance per ${frame.slotName}`} unit="km" labelEvery={frame.labelEvery} fit view="driving" stops={stops} />
    </ChartCard>
  );
}

// A bar's energy, for its tip under the kilometres: Energy "1.4 kWh" and Efficiency "106 Wh/km", each where the bar has
// one (both need drives of at least 1 km, see DrivingFigure).
export function energyLines(figure: DrivingFigure | undefined): TipRow[] {
  const lines: TipRow[] = [];
  if (figure?.kwh != null && figure.kwh > 0) lines.push({ label: "Energy", value: formatKwh(figure.kwh) });
  if (figure?.whPerKm != null) lines.push({ label: "Efficiency", value: `${formatNumber(figure.whPerKm, DECIMALS.whPerKm)} Wh/km` });
  return lines;
}

// The line under the Distance chart: "14.5 kWh used, 2.6 kWh won back while slowing, 111 Wh/km, 4 Wh/km
// better than the 7 days before." Only the parts known: energy used is the bars' raw sum (see knownBars;
// a bar with no figure and no driving used nothing), regen only when it won any, Wh/km where the span has
// one. The comparison is of Wh/km, lower the better, where both spans have one (more kWh over more km isn't
// worse); else of the energy itself. Null when the energy counter has no reading for a span with driving in
// it, or there is nothing to say (then the chart's caption names its bars instead).
export function energyCaption(driving: DrivingPeriod, previousLabel: string | null): string | null {
  const { current, previous, bars } = driving;
  // No reading with no driving is nothing used; with driving it's unknown.
  if ((current.kwh ?? (current.km ? null : 0)) === null) return null;
  const used = sumKnown(bars.map((v) => v?.kwh ?? (v?.km === 0 ? 0 : null)));
  const regen = sumKnown(bars.map((v) => v?.regenKwh ?? null));
  const parts: string[] = [];
  if (used > 0) parts.push(`${formatKwh(used)} used`);
  if (regen > 0) parts.push(`${formatKwh(regen)} won back while slowing`);
  if (current.whPerKm !== null) parts.push(`${formatNumber(current.whPerKm, DECIMALS.whPerKm)} Wh/km`);
  if (parts.length === 0) return null;
  const compared =
    current.whPerKm !== null && previous?.whPerKm != null
      ? comparedWith(current.whPerKm, previous.whPerKm, "Wh/km", previousLabel, { decimals: DECIMALS.whPerKm, lowerIsBetter: true })
      : comparedWith(used, previous?.kwh ?? null, "kWh", previousLabel, { decimals: DECIMALS.kWh });
  return headline(parts.join(", "), compared);
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

// Drive stats for the period or range, after TeslaMate's: how many drives, how long they usually are, the
// longest, time at the wheel and distance a day. Counted, never projected. `spanDays` is how long the span
// has run; when the stats cover fewer days (tracking began later, or the drives kept stop short), the
// caption says how many. `partial` says the drives reach back only DRIVE_DAYS.
export function DriveStatsSection({ stats, partial = false }: { stats: DriveStats | null; partial?: boolean }) {
  if (!stats) return null;
  // Distance and distance per day are the Distance chart's: the odometer counts every metre, while drives
  // leave out moves too short to count as one, so a second total here would disagree with it.
  const figures = [
    { label: "Trips", value: compactNumber.format(stats.trips), note: `${compactNumber.format(stats.drives)} ${stats.drives === 1 ? "drive" : "drives"}` },
    { label: "Typical drive", value: formatKm(stats.medianKm), note: "Half your drives are longer" },
    { label: "Longest drive", value: formatKm(stats.longestKm) },
    { label: "Time driving", value: formatDuration(stats.hours * 3600) },
  ];
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium tracking-heading">Drive stats</h2>
      {/* Tiles: easier to take in than a long list. */}
      <Figures figures={figures} />
      {partial && <p className="text-sm text-faint">Drives cover only the last {DRIVE_DAYS} days.</p>}
    </section>
  );
}
