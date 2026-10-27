"use client";

import { ChartCard } from "@/components/chart-card";
import { periodPhrase } from "@/components/stats/chart-caption";
import { Figures } from "@/components/stats/figures";
import { LineChart } from "@/components/stats/line-chart";
import { formatCelsius, formatClock, formatKm, formatKwh, formatNumber, formatShortDate } from "@/lib/format";
import { backTo, weeksIn, within } from "@/lib/kept";
import type { Timeframe } from "@/lib/periods";
import type { BatteryExtras, Point } from "@/lib/server/battery-extra";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// Readings further apart than this break the line: the car was asleep or out of reach, not reading.
const GAP = 3 * HOUR;
const when = (t: number) => `${formatShortDate(t)}, ${formatClock(t)}`;
const inFrame = (points: Point[], frame: Timeframe) => within(points, frame.span, (p) => p.x);
// The first reading held across the series, for the note on how far back they go.
const firstOf = (series: Point[][]) => {
  const firsts = series.flatMap((points) => (points.length > 0 ? [points[0].x] : []));
  return firsts.length > 0 ? Math.min(...firsts) : null;
};
// Clock times along a chart of two days or less, dates along a longer one.
const timeTicks = (points: Point[]) => {
  const xs = points.map((p) => p.x);
  return xs.length > 0 && Math.max(...xs) - Math.min(...xs) <= 2 * DAY ? formatClock : formatShortDate;
};

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
  const cut = backTo(frame.span, firstOf(all.map((s) => s.points)), "Readings");
  return (
    <ChartCard
      title="Temperatures"
      description={drawn ? `Battery, cabin and outside temperatures, ${periodPhrase(frame)}.` : "Battery, cabin and outside temperatures."}
      summary={
        drawn && (
          <div className="space-y-2">
            {/* The latest of each in the span, labelled like the chart's legend. */}
            <Figures
              figures={series.map((s) => {
                const v = s.points.at(-1)?.y;
                return v !== undefined && { label: s.name, value: formatCelsius(v) };
              })}
            />
            <p className="text-xs text-faint">Latest reading, {when(last)}</p>
          </div>
        )
      }
      caption={cut}
      empty={!drawn && `No temperature data ${frame.words}.`}
    >
      <LineChart
        series={series}
        formatX={when}
        formatTickX={timeTicks(series.flatMap((s) => s.points))}
        formatY={(y) => formatCelsius(y)}
        unit="°C"
        gap={GAP}
        label={`Battery, inside and outside temperature, ${frame.title}`}
      />
    </ChartCard>
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
  const mv = (y: number) => `${formatNumber(y, 0)} mV`;
  const cut = backTo(frame.span, spread[0].x, "Readings");
  return (
    <ChartCard
      title="Cell balance"
      description={shown.length >= 2 ? `Gap between the highest and lowest cell, ${periodPhrase(frame)}. Lower is better.` : "Gap between the highest and lowest cell. Lower is better."}
      info="A gap that keeps growing over months is worth a service check."
      summary={
        <Figures
          figures={[
            { label: "Gap now", value: mv(now.y), note: `Latest, ${when(now.x)}` },
            widest && { label: "Widest", value: mv(widest.y), note: when(widest.x) },
          ]}
        />
      }
      caption={cut}
      empty={shown.length < 2 && `No cell voltage data ${frame.words}.`}
    >
      <LineChart
        series={[{ name: "Gap", className: "stroke-chart-accent", points: shown }]}
        formatX={when}
        formatTickX={timeTicks(shown)}
        formatY={mv}
        unit="mV"
        gap={GAP}
        label={`Cell voltage gap over time, ${frame.title}, in millivolts`}
        yFrom={0}
      />
    </ChartCard>
  );
}

// Each week's usable capacity against the odometer, after TeslaMate's capacity by mileage: the weeks
// that overlap the span, as far back as the estimates go (12 weeks).
export function CapacityByKm({ points, frame }: { points: BatteryExtras["capacityByKm"]; frame: Timeframe }) {
  if (points.length < 2) return null;
  const shown = weeksIn(points, frame.span);
  return (
    <ChartCard
      title="Capacity by distance"
      description={shown.length >= 2 ? `Usable capacity each week against the odometer, ${periodPhrase(frame)}.` : "Usable capacity each week, against the odometer."}
      caption={backTo(frame.span, points[0].weekStart, "Weekly estimates")}
      empty={
        shown.length < 2 &&
        (shown.length === 1
          ? `Week of ${formatShortDate(shown[0].weekStart)}: ${formatKwh(shown[0].y)} at ${formatKm(shown[0].x)}. A line needs two weeks.`
          : `No weekly estimate ${frame.words}.`)
      }
    >
      <LineChart
        series={[{ name: "Capacity", className: "stroke-chart-accent", points: shown }]}
        formatX={(x) => formatKm(x)}
        formatY={(y) => formatKwh(y)}
        unit="kWh"
        label={`Usable capacity against the odometer, ${frame.title}`}
      />
    </ChartCard>
  );
}

// Tesla's own full-pack figure by week (the middle value of the week's readings), in the weeks that overlap
// the span, once it reported it in at least two weeks. It only comes when the figure changes, so a week
// without a point had no new figure.
export function TeslaPackByWeek({ pack, frame }: { pack: BatteryExtras["teslaPack"]; frame: Timeframe }) {
  const weeks = pack?.weekly ?? [];
  if (weeks.length < 2) return null;
  const shown = weeksIn(weeks, frame.span);
  return (
    <ChartCard
      title="Full pack by week, per Tesla"
      description={shown.length >= 2 ? `Full-pack energy as the car reports it, ${periodPhrase(frame)}.` : "Full-pack energy, as the car reports it."}
      caption={backTo(frame.span, weeks[0].weekStart, "Weekly reports")}
      empty={
        shown.length < 2 &&
        (shown.length === 1
          ? `Week of ${formatShortDate(shown[0].weekStart)}: ${formatKwh(shown[0].kwh)}. A line needs two weeks.`
          : `No new figure from Tesla ${frame.words}.`)
      }
    >
      <LineChart
        series={[{ name: "Full pack", className: "stroke-chart-accent", points: shown.map((w) => ({ x: w.weekStart, y: w.kwh })) }]}
        formatX={(x) => `Week of ${formatShortDate(x)}`}
        formatTickX={formatShortDate}
        formatY={(y) => formatKwh(y)}
        unit="kWh"
        label={`Tesla's full-pack figure by week, ${frame.title}`}
      />
    </ChartCard>
  );
}
