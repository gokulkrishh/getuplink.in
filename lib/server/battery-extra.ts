import "server-only";
import type { Owner } from "./data/owner";
import { num, type Reading } from "@/lib/telemetry-derive";
import { type TeslaPack, teslaPack } from "@/lib/tesla-pack";
import { trendWindow } from "./battery";
import { loadStream } from "./telemetry";
import { loadReadingsByField } from "./telemetry-window";

const NOMINAL = "NominalFullPackEnergyKwh";

const DAY = 86_400_000;
export const TEMP_DAYS = 7;

export type Point = { x: number; y: number };

// What the battery page adds from the stream: temperatures and cell balance for the last week, and Tesla's
// own full-pack figure. Each part is empty until the car streams its fields.
export type BatteryExtras = {
  temps: { battery: Point[]; inside: Point[]; outside: Point[] };
  cellSpreadMv: Point[]; // highest minus lowest cell voltage, in mV
  // Tesla's own full-pack figure, as last reported, with its weekly median over the trend's weeks.
  teslaPack: TeslaPack | null;
};

const series = (readings: Reading[] | undefined): Point[] =>
  (readings ?? []).flatMap((r) => {
    const y = num(r.value);
    return y === null ? [] : [{ x: Date.parse(r.at), y }];
  });

// Pairs two series by time: each reading of `a` with the latest of `b` within 10 minutes before it.
function pair(a: Point[], b: Point[], f: (x: number, y: number) => number): Point[] {
  return a.flatMap((p) => {
    const q = b.findLast((r) => r.x <= p.x + 60_000 && r.x >= p.x - 10 * 60_000);
    return q ? [{ x: p.x, y: f(p.y, q.y) }] : [];
  });
}

export async function loadBatteryExtras(owner: Owner, vin: string | null, now: number): Promise<BatteryExtras> {
  const empty: BatteryExtras = { temps: { battery: [], inside: [], outside: [] }, cellSpreadMv: [], teslaPack: null };
  if (!vin) return empty;
  const from = new Date(now - TEMP_DAYS * DAY).toISOString();
  const to = new Date(now).toISOString();
  // The trend's 12 weeks, whether or not each has a usable-capacity figure: Tesla's own figure has its own weeks.
  const trendFrom = new Date(trendWindow(now).from).toISOString();
  // Tesla only sends its figure when it changes, so the latest is read on its own, of any age.
  const [recent, nominal, latest] = await Promise.all([
    loadReadingsByField(owner, vin, ["ModuleTempMax", "InsideTemp", "OutsideTemp", "BrickVoltageMax", "BrickVoltageMin"], from, to),
    loadReadingsByField(owner, vin, [NOMINAL], trendFrom, to),
    loadStream(owner, vin, [NOMINAL]),
  ]);
  const pack = teslaPack(latest[NOMINAL], nominal?.[NOMINAL] ?? []);
  if (!recent) return { ...empty, teslaPack: pack };
  return {
    teslaPack: pack,
    temps: { battery: series(recent.ModuleTempMax), inside: series(recent.InsideTemp), outside: series(recent.OutsideTemp) },
    cellSpreadMv: pair(series(recent.BrickVoltageMax), series(recent.BrickVoltageMin), (hi, lo) => (hi - lo) * 1000),
  };
}
