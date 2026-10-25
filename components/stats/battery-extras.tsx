"use client";

import { unitNotes } from "@/components/stats/chart-caption";
import { ChartNote } from "@/components/stats/chart-note";
import { Figures } from "@/components/stats/figures";
import { LineChart } from "@/components/stats/line-chart";
import { formatClock, formatShortDate } from "@/lib/format";
import { backTo, weeksIn, within } from "@/lib/kept";
import type { Timeframe } from "@/lib/periods";
import type { BatteryExtras, Point } from "@/lib/server/battery-extra";

const when = (t: number) => `${formatShortDate(t)}, ${formatClock(t)}`;
const oneDecimal = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });
const number = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const inFrame = (points: Point[], frame: Timeframe) => within(points, frame.span, (p) => p.x);
// The first reading held across the series, for the note on how far back they go.
const firstOf = (series: Point[][]) => {
  const firsts = series.flatMap((points) => (points.length > 0 ? [points[0].x] : []));
  return firsts.length > 0 ? Math.min(...firsts) : null;
};

// What a section's caption says under its chart: what is plotted, the span, and how far back the readings
// go when the span starts earlier.
function Caption({ plotted, frame, first, chart, what = "Readings" }: { plotted: string; frame: Timeframe; first: number | null; chart: boolean; what?: string }) {
  const cut = backTo(frame.span, first, what);
  return (
    <p className="text-xs text-muted-foreground">
      {plotted} {frame.title}.{cut && ` ${cut}`}
      {chart && " Hover or tap the chart to see a reading."}
    </p>
  );
}

// Battery, cabin and outside temperature over the span, as far back as the readings go (the last week),
// after TeslaMate's temperatures. The figures are the latest reading in the span.
export function Temperatures({ temps, frame }: { temps: BatteryExtras["temps"]; frame: Timeframe }) {
  const all = [
    { name: "Battery", className: "stroke-chart-accent", points: temps.battery },
    { name: "Inside", className: "stroke-positive", points: temps.inside },
    { name: "Outside", className: "stroke-muted-foreground", points: temps.outside },
  ];
  if (!all.some((s) => s.points.length >= 2)) return null;
  const series = all.map((s) => ({ ...s, points: inFrame(s.points, frame) }));
  const drawn = series.some((s) => s.points.length >= 2);
  const last = Math.max(...series.flatMap((s) => s.points.map((p) => p.x)));
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg font-medium tracking-heading">Temperatures</h2>
        {drawn && (
          <>
            {/* The latest of each in the span, labelled like the chart's legend. */}
            <Figures
              figures={series.map((s) => {
                const v = s.points.at(-1)?.y;
                return v !== undefined && { label: s.name, value: `${oneDecimal.format(v)} °C` };
              })}
            />
            <p className="text-xs text-faint">Latest reading {frame.words}, {when(last)}.</p>
          </>
        )}
      </div>
      <div className="space-y-3">
        {drawn ? (
          <LineChart series={series} formatX={when} formatY={(y) => `${number.format(y)} °C`} label={`Battery, inside and outside temperature, ${frame.title}`} />
        ) : (
          <ChartNote>No temperature readings {frame.words}.</ChartNote>
        )}
        <Caption plotted="Temperature of the battery, the cabin and the air outside, in °C (degrees Celsius)." frame={frame} first={firstOf(all.map((s) => s.points))} chart={drawn} />
      </div>
    </section>
  );
}

// The gap between the highest and lowest cell voltage, said plainly for an owner who doesn't know what a
// cell or mV is. A healthy pack keeps it small at rest; a gap that grows over months is worth asking
// Tesla about. "Gap now" is the latest reading whatever the span; the widest and the chart are the span's,
// as far back as the readings go (the last week, see loadBatteryExtras).
export function CellBalance({ spread, frame }: { spread: BatteryExtras["cellSpreadMv"]; frame: Timeframe }) {
  if (spread.length < 2) return null;
  const now = spread.at(-1)!;
  const shown = inFrame(spread, frame);
  const widest = shown.length > 0 ? shown.reduce((a, p) => (p.y > a.y ? p : a)) : null;
  const mv = (y: number) => `${number.format(y)} mV`;
  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <h2 className="text-lg font-medium tracking-heading">Cell balance</h2>
        <p className="text-sm text-muted-foreground">
          The battery is made of many cells. This is how far apart the highest and lowest cell voltage are, in millivolts (mV, thousandths of a volt). Smaller is
          better: it means the cells are evenly balanced.
        </p>
        <Figures
          figures={[
            { label: "Gap now", value: mv(now.y), note: `Latest reading, ${when(now.x)}` },
            widest && { label: "Widest", value: mv(widest.y), note: `${frame.title}, ${when(widest.x)}` },
          ]}
        />
        <p className="text-sm text-muted-foreground">It widens while driving and charging hard, and settles back at rest. A gap that keeps growing over months is worth a service check.</p>
      </div>
      <div className="space-y-3">
        {shown.length >= 2 ? (
          <LineChart
            series={[{ name: "Gap", className: "stroke-chart-accent", points: shown }]}
            formatX={when}
            formatY={mv}
            label={`Cell voltage gap at each reading, ${frame.title}, in millivolts`}
            yFrom={0}
          />
        ) : (
          <ChartNote>No cell voltage readings {frame.words}.</ChartNote>
        )}
        <Caption plotted="The gap at each reading, in mV." frame={frame} first={spread[0].x} chart={shown.length >= 2} />
      </div>
    </section>
  );
}

// Each week's estimated full pack against the odometer, after TeslaMate's capacity by mileage: the weeks
// that overlap the span, as far back as the estimates go (12 weeks).
export function CapacityByKm({ points, frame }: { points: BatteryExtras["capacityByKm"]; frame: Timeframe }) {
  if (points.length < 2) return null;
  const shown = weeksIn(points, frame.span);
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg font-medium tracking-heading">Capacity by distance</h2>
        <p className="text-sm text-muted-foreground">The estimated full pack each week, against the odometer.</p>
      </div>
      <div className="space-y-3">
        {shown.length >= 2 ? (
          <LineChart
            series={[{ name: "Capacity", className: "stroke-chart-accent", points: shown }]}
            formatX={(x) => `${number.format(x)} km`}
            formatY={(y) => `${oneDecimal.format(y)} kWh`}
            label={`Estimated full pack against the odometer, ${frame.title}`}
          />
        ) : (
          <ChartNote>
            {shown.length === 1
              ? `Week of ${formatShortDate(shown[0].weekStart)}: ${oneDecimal.format(shown[0].y)} kWh at ${number.format(shown[0].x)} km. A line needs two weeks.`
              : `No weekly estimate ${frame.words}.`}
          </ChartNote>
        )}
        <Caption
          plotted={`How much energy a full battery holds, as the car estimates it, one point a week, set against the odometer: the km the car had driven by then. ${unitNotes(["kWh"])}`}
          frame={frame}
          first={points[0].weekStart}
          chart={shown.length >= 2}
          what="Weekly estimates"
        />
      </div>
    </section>
  );
}
