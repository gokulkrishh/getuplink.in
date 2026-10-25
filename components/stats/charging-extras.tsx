"use client";

import { unitNotes } from "@/components/stats/chart-caption";
import { LineChart } from "@/components/stats/line-chart";
import { type MapPin, TripMap } from "@/components/stats/trip-map";
import { formatShortDate } from "@/lib/format";
import type { Timeframe } from "@/lib/periods";
import type { Curve } from "@/lib/server/charging-extra";
import { Measure } from "@/components/measure";

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

// How DC charging power falls as the battery fills, after TeslaMate's DC charging curve, for the DC charges
// in the span: one typical line for Superchargers and one for other DC chargers, then each charge with its
// peak and average. `serial` is each charge's number in the session list. `note` says how far back the
// curves go, when only the latest few are kept.
export function DcCurves({ curves, frame, note }: { curves: (Curve & { serial?: number })[]; frame: Timeframe; note: string | null }) {
  const series = [
    { name: "Superchargers", className: "stroke-chart-accent", points: typical(curves.filter((c) => c.supercharger)) },
    { name: "Other DC chargers", className: "stroke-positive", points: typical(curves.filter((c) => !c.supercharger)) },
  ];
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg font-medium tracking-heading">DC charging speed</h2>
        <p className="text-sm text-muted-foreground">
          {frame.title}.{" "}
          {curves.length > 0
            ? `Typical power as the battery fills, from ${curves.length} DC ${curves.length === 1 ? "charge" : "charges"}. Power drops as the battery gets fuller.`
            : `No DC charging curves ${frame.words}.`}
        </p>
      </div>
      {curves.length > 0 && (
        <>
          <LineChart
            series={series}
            formatX={(x) => `${Math.round(x)}%`}
            formatY={(y) => `${Math.round(y)} kW`}
            label="Typical DC charging power against battery level"
            yFrom={0}
            caption={`Charging power, up the side, against battery level from 0 to 100%, along the bottom: the middle value in each ${BAND}% step. DC is fast charging. ${unitNotes(["kW"])}`}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-md table-fixed text-sm tabular-nums">
              <colgroup>
                <col className="w-10" />
                <col className="w-24" />
                <col />
                <col className="w-20" />
                <col className="w-20" />
              </colgroup>
              <thead>
                <tr className="border-b text-left text-xs text-faint">
                  <th scope="col" className="py-2 pr-3 font-normal">#</th>
                  <th scope="col" className="py-2 pr-3 font-normal">Date</th>
                  <th scope="col" className="py-2 pr-3 font-normal">Charger</th>
                  <th scope="col" className="py-2 pr-3 text-right font-normal">Peak</th>
                  <th scope="col" className="py-2 text-right font-normal">Average</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {curves.map((c) => {
                  const ys = c.points.map((p) => p.y);
                  return (
                    <tr key={c.id}>
                      <td className="py-3 pr-3 font-mono text-xs text-faint">{c.serial ?? ""}</td>
                      <td className="py-3 pr-3 whitespace-nowrap">{formatShortDate(c.date)}</td>
                      <td className="truncate py-3 pr-3">{c.name}</td>
                      <td className="py-3 pr-3 text-right font-mono"><Measure text={`${Math.round(Math.max(...ys))} kW`} /></td>
                      <td className="py-3 text-right font-mono"><Measure text={`${Math.round(ys.reduce((a, b) => a + b, 0) / ys.length)} kW`} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {note && <p className="text-xs text-faint">{note}</p>}
    </section>
  );
}

// Where you charged in the span, each pin sized by the energy added. `note` says how far back the pins go,
// when only the latest charges are pinned.
export function ChargingMap({ pins, frame, note }: { pins: MapPin[]; frame: Timeframe; note: string | null }) {
  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-lg font-medium tracking-heading">Charging map</h2>
        <p className="text-sm text-muted-foreground">
          {frame.title}. {pins.length > 0 ? "Each charge where it happened; bigger pins added more energy." : `No charges with a location ${frame.words}.`}
        </p>
      </div>
      {pins.length > 0 && <TripMap pins={pins} label={`${pins.length} charges on a map`} />}
      {note && <p className="text-xs text-faint">{note}</p>}
    </section>
  );
}
