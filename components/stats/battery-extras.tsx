"use client";

import { Figures } from "@/components/stats/figures";
import { LineChart } from "@/components/stats/line-chart";
import { formatClock, formatShortDate } from "@/lib/format";
import type { BatteryExtras } from "@/lib/server/battery-extra";

const when = (t: number) => `${formatShortDate(t)}, ${formatClock(t)}`;
const oneDecimal = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });
const number = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const latest = (points: { y: number }[]) => points.at(-1)?.y ?? null;

// Battery, cabin and outside temperature over the last week, after TeslaMate's temperatures.
export function Temperatures({ temps }: { temps: BatteryExtras["temps"] }) {
  const series = [
    { name: "Battery", className: "stroke-chart-accent", points: temps.battery },
    { name: "Inside", className: "stroke-positive", points: temps.inside },
    { name: "Outside", className: "stroke-muted-foreground", points: temps.outside },
  ];
  if (!series.some((s) => s.points.length >= 2)) return null;
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg font-medium tracking-heading">Temperatures</h2>
        {/* The latest of each, labelled like the chart's legend. */}
        <Figures
          figures={series.map((s) => {
            const v = latest(s.points);
            return v !== null && { label: s.name, value: `${oneDecimal.format(v)} °C` };
          })}
        />
      </div>
      <LineChart series={series} formatX={when} formatY={(y) => `${number.format(y)} °C`} label="Battery, inside and outside temperature over the last week" />
    </section>
  );
}

// The gap between the highest and lowest cell voltage, said plainly for an owner who doesn't know what a
// cell or mV is. A healthy pack keeps it small at rest; a gap that grows over months is worth asking
// Tesla about. `days` is the window the readings cover (see loadBatteryExtras).
export function CellBalance({ spread, days }: { spread: BatteryExtras["cellSpreadMv"]; days: number }) {
  if (spread.length < 2) return null;
  const now = spread.at(-1)!;
  const widest = spread.reduce((a, p) => (p.y > a.y ? p : a));
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
            { label: "Gap now", value: mv(now.y), note: when(now.x) },
            { label: "Widest", value: mv(widest.y), note: `Last ${days} days · ${when(widest.x)}` },
          ]}
        />
        <p className="text-sm text-muted-foreground">It widens while driving and charging hard, and settles back at rest. A gap that keeps growing over months is worth a service check.</p>
      </div>
      <div className="space-y-2">
        <p className="text-xs text-faint">The gap at each reading over the last {days} days, in mV. Hover or tap the chart to see a reading.</p>
        <LineChart series={[{ name: "Gap", className: "stroke-chart-accent", points: spread }]} formatX={when} formatY={mv} label={`Cell voltage gap at each reading over the last ${days} days, in millivolts`} yFrom={0} />
      </div>
    </section>
  );
}

// Each week's estimated full pack against the odometer, after TeslaMate's capacity by mileage.
export function CapacityByKm({ points }: { points: BatteryExtras["capacityByKm"] }) {
  if (points.length < 2) return null;
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg font-medium tracking-heading">Capacity by distance</h2>
        <p className="text-sm text-muted-foreground">The estimated full pack each week, against the odometer.</p>
      </div>
      <LineChart
        series={[{ name: "Capacity", className: "stroke-chart-accent", points }]}
        formatX={(x) => `${number.format(x)} km`}
        formatY={(y) => `${oneDecimal.format(y)} kWh`}
        label="Estimated full pack against the odometer"
      />
    </section>
  );
}
