"use client";

import { LineChart } from "@/components/stats/line-chart";
import { type MapPin, TripMap } from "@/components/stats/trip-map";
import { formatShortDate } from "@/lib/format";
import type { Curve } from "@/lib/server/charging-extra";

const BAND = 5; // battery % per point of the typical curve

// The median power in each 5% band of battery level, across the given charges.
function typical(curves: Curve[]): { x: number; y: number }[] {
  const bands = new Map<number, number[]>();
  for (const c of curves) for (const p of c.points) {
    const band = Math.floor(p.x / BAND) * BAND + BAND / 2;
    bands.set(band, [...(bands.get(band) ?? []), p.y]);
  }
  return [...bands.entries()]
    .sort(([a], [b]) => a - b)
    .map(([x, ys]) => ({ x, y: [...ys].sort((a, b) => a - b)[Math.floor(ys.length / 2)] }));
}

// How DC charging power falls as the battery fills, after TeslaMate's DC charging curve: one typical line
// for Superchargers and one for other DC chargers, then the recent charges with their peak and average.
export function DcCurves({ curves }: { curves: Curve[] }) {
  if (curves.length === 0) return null;
  const series = [
    { name: "Superchargers", className: "stroke-chart-accent", points: typical(curves.filter((c) => c.supercharger)) },
    { name: "Other DC chargers", className: "stroke-positive", points: typical(curves.filter((c) => !c.supercharger)) },
  ];
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-xs font-medium tracking-wide text-faint uppercase">DC charging speed</h2>
        <p className="text-sm text-muted-foreground">Typical power as the battery fills, from your last {curves.length} DC charges. Power drops as the battery gets fuller.</p>
      </div>
      <LineChart series={series} formatX={(x) => `${Math.round(x)}%`} formatY={(y) => `${Math.round(y)} kW`} label="Typical DC charging power against battery level" yFrom={0} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-md text-sm tabular-nums">
          <thead>
            <tr className="border-b text-left text-xs text-faint">
              <th scope="col" className="py-2 pr-4 font-normal">Date</th>
              <th scope="col" className="py-2 pr-4 font-normal">Charger</th>
              <th scope="col" className="py-2 pr-4 text-right font-normal">Peak</th>
              <th scope="col" className="py-2 text-right font-normal">Average</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {curves.map((c) => {
              const ys = c.points.map((p) => p.y);
              return (
                <tr key={c.date}>
                  <td className="py-3 pr-4 whitespace-nowrap">{formatShortDate(c.date)}</td>
                  <td className="py-3 pr-4">{c.name}</td>
                  <td className="py-3 pr-4 text-right font-mono">{Math.round(Math.max(...ys))} kW</td>
                  <td className="py-3 text-right font-mono">{Math.round(ys.reduce((a, b) => a + b, 0) / ys.length)} kW</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// Where you charged, each pin sized by the energy added.
export function ChargingMap({ pins }: { pins: MapPin[] }) {
  if (pins.length === 0) return null;
  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-xs font-medium tracking-wide text-faint uppercase">Charging map</h2>
        <p className="text-sm text-muted-foreground">Each charge where it happened; bigger pins added more energy.</p>
      </div>
      <TripMap pins={pins} label={`${pins.length} charges on a map`} />
    </section>
  );
}
