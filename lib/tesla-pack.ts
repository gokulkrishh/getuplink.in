import { num, type Reading, roundKwh, type WeeklyPack, weeklyPack } from "@/lib/telemetry-derive";

// Tesla's own figure for a full pack (the NominalFullPackEnergyKwh field), as the car last reported it,
// and its weekly median for a chart. The car only sends it when it changes, so `latest` is the newest
// reading of any age and `readings` the ones in the chart's window. Pure, so tested.
export type TeslaPack = { kwh: number; at: string; weekly: WeeklyPack[] };

export function teslaPack(latest: Reading | undefined, readings: Reading[]): TeslaPack | null {
  const kwh = num(latest?.value);
  if (!latest || kwh === null || kwh <= 0) return null;
  const estimates = readings.flatMap((r) => {
    const v = num(r.value);
    return v !== null && v > 0 ? [{ at: r.at, kwh: v }] : [];
  });
  return { kwh: roundKwh(kwh), at: latest.at, weekly: weeklyPack(estimates) };
}
