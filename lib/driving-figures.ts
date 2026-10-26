import { MILES_TO_KM } from "@/lib/car";
import { MIN_EFFICIENCY_KM } from "@/lib/dashboard-summary";
import { type Period, PERIOD_ORDER, periodTimeframe, type Span, type Timeframe } from "@/lib/periods";
import { MIN_ENERGY_KM } from "@/lib/telemetry-derive";

// Distance, energy use and regen for every period, its comparison span and its bars, from cumulative
// counters read at a fixed list of instants (see figureInstants). Pure: the loader in lib/server/driving.ts
// reads the counters (or the demo's) in two requests and passes them through here.

// A counter's value and when it was read (ms).
export type CounterValue = { value: number; at: number };
// The first reading ever, then the last reading before each instant of a list.
export type CounterColumn = { first: CounterValue | null; bounds: (CounterValue | null)[] };

// Every instant the figures read the counters at: each bar's edges, each period's start and the span it is
// compared with. Instants after now become Infinity, whose last reading is the latest.
export function figureInstants(now: number): number[] {
  return timeframeInstants(
    PERIOD_ORDER.map((period) => periodTimeframe(period, now)),
    now,
  );
}

// The same for any timeframes, like a range picked by date.
export function timeframeInstants(frames: Timeframe[], now: number): number[] {
  const instants = new Set<number>([Infinity]);
  const add = (t: number) => {
    if (Number.isFinite(t)) instants.add(t > now ? Infinity : t);
  };
  for (const frame of frames) {
    add(frame.span.from);
    add(frame.span.to);
    if (frame.previous) {
      add(frame.previous.from);
      add(frame.previous.to);
    }
    for (const slot of frame.slots) {
      add(slot.from);
      add(slot.to);
    }
  }
  return [...instants].sort((a, b) => a - b);
}

// A counter's readings by instant.
type Readings = { first: CounterValue | null; before: Map<number, CounterValue | null> };

function byInstant(instants: number[], column: CounterColumn | null): Readings | null {
  return column ? { first: column.first, before: new Map(instants.map((t, k) => [t, column.bounds[k] ?? null])) } : null;
}

// Two sources of one counter (the streamed odometer and the polled one): the reading taken last before each
// instant, and the earlier first reading.
function newest(a: Readings | null, b: Readings | null): Readings | null {
  if (!a || !b) return a ?? b;
  const later = (x: CounterValue | null, y: CounterValue | null) => (!x ? y : !y ? x : y.at > x.at ? y : x);
  const earlier = (x: CounterValue | null, y: CounterValue | null) => (!x ? y : !y ? x : y.at < x.at ? y : x);
  return { first: earlier(a.first, b.first), before: new Map([...a.before].map(([t, x]) => [t, later(x, b.before.get(t) ?? null)])) };
}

const valueBefore = (r: Readings, t: number, now: number) => r.before.get(t > now ? Infinity : t)?.value ?? null;

// The span has a reading before it starts, so its rise is the whole span's, not part of it.
const covers = (r: Readings | null, span: Span, now: number) => Boolean(r) && Number.isFinite(span.from) && valueBefore(r!, span.from, now) !== null;

// How much a counter rose over a span: from its last value before the span (its first reading when there
// is none: the span began before tracking did) to its last value before the span ends. Null when nothing
// was read by the end, or the span lies ahead.
function rise(r: Readings | null, span: Span, now: number): number | null {
  if (!r || span.from > now) return null;
  const end = valueBefore(r, span.to, now);
  const start = (Number.isFinite(span.from) ? valueBefore(r, span.from, now) : null) ?? r.first?.value ?? null;
  return end === null || start === null ? null : Math.max(0, end - start);
}

// kwh: energy used in the span by the lifetime counter, parked use included, under the same minimum
// distance as whPerKm.
export type DrivingFigure = { km: number | null; whPerKm: number | null; kwh: number | null; regenKwh: number | null };
// `previous` is the span it is compared with (see previousSpan); a figure there is null unless its counter
// was read before that span began. `bars` follow slotsFor.
export type DrivingPeriod = { current: DrivingFigure; previous: DrivingFigure | null; bars: DrivingFigure[] };
// `since` is the first odometer reading (when tracking began); `odometerKm` the latest.
export type DrivingFigures = { periods: Record<Period, DrivingPeriod>; since: number | null; odometerKm: number | null };

export type DrivingCounters = {
  instants: number[];
  // Streamed counters: Odometer (miles), LifetimeEnergyUsed and LifetimeEnergyGainedRegen (kWh).
  odometer: CounterColumn | null;
  used: CounterColumn | null;
  regen: CounterColumn | null;
  // The polled odometer (miles), from before the stream began.
  polledOdometer: CounterColumn | null;
};

// Each counter's readings by instant, and the figure for a span from them.
function figureReader(input: DrivingCounters, now: number) {
  const at = (column: CounterColumn | null) => byInstant(input.instants, column);
  const streamed = at(input.odometer);
  const odometer = newest(streamed, at(input.polledOdometer));
  const used = at(input.used);
  const regen = at(input.regen);

  // Energy use needs the streamed odometer: the energy counter only exists since the stream began. Below
  // minKm the figure is mostly parked use (Sentry Mode, climate), so there is none.
  const figure = (span: Span, minKm: number, onlyCovered = false): DrivingFigure => {
    const counted = (r: Readings | null) => (!onlyCovered || covers(r, span, now) ? r : null);
    const miles = rise(counted(odometer), span, now);
    const streamedMiles = rise(counted(streamed), span, now);
    const kwh = rise(counted(used), span, now);
    const streamedKm = streamedMiles === null ? 0 : streamedMiles * MILES_TO_KM;
    return {
      // Not rounded: the bars' raw kilometres add up to the span's; only the display rounds.
      km: miles === null ? null : miles * MILES_TO_KM,
      whPerKm: kwh !== null && kwh > 0 && streamedKm >= minKm ? (kwh * 1000) / streamedKm : null,
      kwh: kwh !== null && kwh > 0 && streamedKm >= minKm ? kwh : null,
      regenKwh: rise(counted(regen), span, now),
    };
  };
  const period = (frame: Timeframe, minKm: number): DrivingPeriod => ({
    current: figure(frame.span, minKm),
    previous: frame.previous && figure(frame.previous, minKm, true),
    bars: frame.slots.map((slot) => figure(slot, minKm)),
  });
  return { odometer, period };
}

export function drivingFigures(input: DrivingCounters, now: number): DrivingFigures {
  const { odometer, period } = figureReader(input, now);
  const periods = Object.fromEntries(
    PERIOD_ORDER.map((p) => [p, period(periodTimeframe(p, now), p === "week" ? MIN_EFFICIENCY_KM : MIN_ENERGY_KM)]),
  ) as Record<Period, DrivingPeriod>;
  const latest = odometer ? valueBefore(odometer, Infinity, now) : null;
  return {
    periods,
    since: odometer?.first?.at ?? null,
    odometerKm: latest === null ? null : latest * MILES_TO_KM,
  };
}

// The figures for one timeframe, like a range picked by date; the counters are read at its own instants
// (see timeframeInstants).
export function drivingTimeframe(input: DrivingCounters, frame: Timeframe, now: number): DrivingPeriod {
  return figureReader(input, now).period(frame, MIN_ENERGY_KM);
}
