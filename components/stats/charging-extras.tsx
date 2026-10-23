"use client";

import { LineChart } from "@/components/stats/line-chart";
import { type MapPin, TripMap } from "@/components/stats/trip-map";
import type { Curve } from "@/lib/server/charging-extra";

const STROKES = ["stroke-chart-1", "stroke-chart-2", "stroke-chart-3", "stroke-chart-4", "stroke-chart-5", "stroke-chart-accent", "stroke-positive", "stroke-muted-foreground"];

// Your recent DC charges on one chart, power against battery level, after TeslaMate's DC charging curve:
// where each charger held its power and where it tapered.
export function DcCurves({ curves }: { curves: Curve[] }) {
  if (curves.length === 0) return null;
  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-xs font-medium tracking-wide text-faint uppercase">DC charging curves</h2>
        <p className="text-sm text-muted-foreground">Power against battery level for your last {curves.length === 1 ? "DC charge" : `${curves.length} DC charges`}, to compare chargers.</p>
      </div>
      <LineChart
        series={curves.map((c, k) => ({ name: c.name, className: STROKES[k % STROKES.length], points: c.points }))}
        formatX={(x) => `${Math.round(x)}%`}
        formatY={(y) => `${Math.round(y)} kW`}
        label="Charging power against battery level for recent DC charges"
        yFrom={0}
      />
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
