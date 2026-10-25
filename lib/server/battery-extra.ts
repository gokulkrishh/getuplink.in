import "server-only";
import { MILES_TO_KM } from "@/lib/car";
import { num, type Reading, type WeeklyPack } from "@/lib/telemetry-derive";
import { loadReadingsByField } from "./telemetry-window";

const DAY = 86_400_000;
export const TEMP_DAYS = 7;

export type Point = { x: number; y: number };

// What the battery page adds from the stream: temperatures and cell balance for the last week, and each
// week's capacity against the odometer. Each part is empty until the car streams its fields.
export type BatteryExtras = {
  temps: { battery: Point[]; inside: Point[]; outside: Point[] };
  cellSpreadMv: Point[]; // highest minus lowest cell voltage, in mV
  capacityByKm: (Point & { weekStart: number })[]; // x: odometer km, y: estimated full pack kWh, for the week starting weekStart
};

const series = (readings: Reading[] | undefined, scale = 1): Point[] =>
  (readings ?? []).flatMap((r) => {
    const y = num(r.value);
    return y === null ? [] : [{ x: Date.parse(r.at), y: y * scale }];
  });

// Pairs two series by time: each reading of `a` with the latest of `b` within 10 minutes before it.
function pair(a: Point[], b: Point[], f: (x: number, y: number) => number): Point[] {
  return a.flatMap((p) => {
    const q = b.findLast((r) => r.x <= p.x + 60_000 && r.x >= p.x - 10 * 60_000);
    return q ? [{ x: p.x, y: f(p.y, q.y) }] : [];
  });
}

export async function loadBatteryExtras(vin: string | null, trend: WeeklyPack[], now: number): Promise<BatteryExtras> {
  const empty: BatteryExtras = { temps: { battery: [], inside: [], outside: [] }, cellSpreadMv: [], capacityByKm: [] };
  if (!vin) return empty;
  const from = new Date(now - TEMP_DAYS * DAY).toISOString();
  const to = new Date(now).toISOString();
  const trendFrom = trend.length ? new Date(trend[0].weekStart).toISOString() : from;
  const [recent, odo] = await Promise.all([
    loadReadingsByField(vin, ["ModuleTempMax", "InsideTemp", "OutsideTemp", "BrickVoltageMax", "BrickVoltageMin"], from, to),
    trend.length >= 2 ? loadReadingsByField(vin, ["Odometer"], trendFrom, to) : Promise.resolve(null),
  ]);
  if (!recent) return empty;
  const odometer = series(odo?.Odometer, MILES_TO_KM);
  return {
    temps: { battery: series(recent.ModuleTempMax), inside: series(recent.InsideTemp), outside: series(recent.OutsideTemp) },
    cellSpreadMv: pair(series(recent.BrickVoltageMax), series(recent.BrickVoltageMin), (hi, lo) => (hi - lo) * 1000),
    // Each week's estimate at the odometer reading nearest the middle of that week.
    capacityByKm: trend.flatMap((w) => {
      const mid = w.weekStart + 3.5 * DAY;
      const near = odometer.reduce<Point | null>((a, p) => (!a || Math.abs(p.x - mid) < Math.abs(a.x - mid) ? p : a), null);
      return near && Math.abs(near.x - mid) < 7 * DAY ? [{ x: near.y, y: w.kwh, weekStart: w.weekStart }] : [];
    }),
  };
}
