"use client";

import { ChartCard } from "@/components/chart-card";
import { DcCurvePlot } from "@/components/stats/dc-curve-plot";
import { type MapPin, TripMap } from "@/components/stats/trip-map";
import { formatKw, formatShortDate } from "@/lib/format";
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
    { name: "Superchargers", stroke: "stroke-chart-accent", swatch: "bg-chart-accent", points: typical(curves.filter((c) => c.supercharger)) },
    { name: "Other DC chargers", stroke: "stroke-muted-foreground", swatch: "bg-muted-foreground", points: typical(curves.filter((c) => !c.supercharger)) },
  ];
  return (
    <section className="space-y-6">
      <ChartCard
        title="DC charging speed"
        description={
          curves.length > 0
            ? `Charging power by battery level, from ${curves.length} DC ${curves.length === 1 ? "charge" : "charges"} ${frame.words}. It drops as the battery fills.`
            : "Charging power by battery level. It drops as the battery fills."
        }
        unit="kW"
        terms={["kWh", "DC"]}
        info={`Each point is the middle value in a ${BAND}% step of battery level.`}
        empty={curves.length === 0 ? `No DC charging curves ${frame.words}.` : undefined}
      >
        <DcCurvePlot series={series} band={BAND} label={`Typical DC charging power against battery level, ${frame.title}`} />
      </ChartCard>
      {curves.length > 0 && (
        <>
          <div>
            <table className="w-full table-fixed text-sm tabular-nums">
              <colgroup>
                <col className="w-8 sm:w-10" />
                <col className="w-20 sm:w-24" />
                <col />
                <col className="w-16 sm:w-20" />
                <col className="w-16 sm:w-20" />
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
                {curves.map((c) => (
                  <tr key={c.id}>
                    <td className="py-3 pr-3 font-mono text-xs text-faint">{c.serial ?? ""}</td>
                    <td className="py-3 pr-3 whitespace-nowrap">{formatShortDate(c.date)}</td>
                    <td className="truncate py-3 pr-3">{c.name}</td>
                    <td className="py-3 pr-3 text-right font-mono">{c.peakKw !== null && <Measure text={formatKw(c.peakKw)} />}</td>
                    <td className="py-3 text-right font-mono">{c.avgKw !== null && <Measure text={formatKw(c.avgKw)} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {note && <p className="text-sm text-faint">{note}</p>}
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
        {/* With no pins, the line in the map's place names the period alone. */}
        {pins.length > 0 && <p className="text-sm text-muted-foreground">{frame.title}. Bigger pins added more energy.</p>}
      </div>
      {pins.length > 0 ? (
        <TripMap pins={pins} label={`${pins.length} charges on a map`} legend="A charge; bigger pins added more energy" />
      ) : (
        <p className="text-sm text-muted-foreground">No charges with a location {frame.words}.</p>
      )}
      {note && <p className="text-sm text-faint">{note}</p>}
    </section>
  );
}
