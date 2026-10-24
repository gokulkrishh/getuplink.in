"use client";

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
  const now = series.map((s) => [s.name, latest(s.points)] as const).filter(([, v]) => v !== null);
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-xs font-medium tracking-wide text-faint uppercase">Temperatures</h2>
        <p className="text-sm text-muted-foreground tabular-nums">
          Latest {now.map(([name, v]) => `${name.toLowerCase()} ${oneDecimal.format(v!)} °C`).join(" · ")}
        </p>
      </div>
      <LineChart series={series} formatX={when} formatY={(y) => `${number.format(y)} °C`} label="Battery, inside and outside temperature over the last week" />
    </section>
  );
}

// The gap between the highest and lowest cell voltage. A healthy pack keeps it small, a few mV, at rest;
// a gap that grows over months is worth asking Tesla about.
export function CellBalance({ spread }: { spread: BatteryExtras["cellSpreadMv"] }) {
  if (spread.length < 2) return null;
  const now = latest(spread)!;
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-xs font-medium tracking-wide text-faint uppercase">Cell balance</h2>
        {/* The label wraps as a whole under the figure on a phone, rather than splitting across the big line. */}
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-mono text-4xl font-medium tracking-tight tabular-nums">{number.format(now)} mV</span>
          <span className="text-base text-muted-foreground">between the highest and lowest cell</span>
        </p>
        <p className="text-sm text-muted-foreground">It widens while driving and charging hard, and settles back at rest. A gap that keeps growing over months is worth a service check.</p>
      </div>
      <LineChart series={[{ name: "Gap", className: "stroke-chart-accent", points: spread }]} formatX={when} formatY={(y) => `${number.format(y)} mV`} label="Cell voltage gap over the last week" yFrom={0} />
    </section>
  );
}

// Each week's estimated full pack against the odometer, after TeslaMate's capacity by mileage.
export function CapacityByKm({ points }: { points: BatteryExtras["capacityByKm"] }) {
  if (points.length < 2) return null;
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-xs font-medium tracking-wide text-faint uppercase">Capacity by distance</h2>
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
