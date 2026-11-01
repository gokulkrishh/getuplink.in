// The y axes of the hand-drawn charts (LineChart, ChartFrame under Bars, DriveTrace, the DC curve): where
// their ticks go and how each is written. A tick label is never repeated: rounding three ticks over a
// narrow range to one decimal read "64.1, 64.1, 64" on 64.0 to 64.1 kWh.

// Strip the float noise from a tick worked out by steps (0.1 * 3 is 0.30000000000000004).
const clean = (v: number) => Number(v.toFixed(10));

// The data's reach rounded up to a step finer than 1, 2, 5, so a 54 kW peak tops out at 60, not 100.
const NICE_TOPS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
export function niceTop(value: number): number {
  const step = 10 ** Math.floor(Math.log10(value));
  return clean((NICE_TOPS.find((m) => value <= m * step * (1 + 1e-9)) ?? 10) * step);
}

// The smallest round step (1, 2, 2.5 or 5 times a power of ten) at least this big.
const STEPS = [1, 2, 2.5, 5, 10];
function niceStep(value: number): number {
  const power = 10 ** Math.floor(Math.log10(value));
  return clean((STEPS.find((m) => value <= m * power * (1 + 1e-9)) ?? 10) * power);
}

// Each tick written as a bare number, Indian grouping, compact for large ones ("12.5K"). One decimal, as
// before, unless two ticks would read the same: then as many more as it takes to tell every tick apart
// ("0.1, 0.05, 0"). Every tick uses the same number of decimals at most; trailing zeros drop.
export function axisLabels(values: number[], { compact = true, decimals = 1 }: { compact?: boolean; decimals?: number } = {}): string[] {
  const apart = new Set(values).size;
  for (let d = decimals; d <= decimals + 4; d++) {
    const format = new Intl.NumberFormat("en-IN", compact ? { notation: "compact", maximumFractionDigits: d } : { maximumFractionDigits: d });
    const labels = values.map((v) => format.format(v));
    if (new Set(labels).size === apart) return labels;
  }
  // Compact can't tell them apart ("12.3K" twice): the whole number.
  const plain = new Intl.NumberFormat("en-IN", { maximumFractionDigits: decimals + 4 });
  return values.map((v) => plain.format(v));
}

export type LineAxis = { lo: number; hi: number; ticks: number[]; labels: string[] };

// LineChart's y axis: three ticks, top, middle and bottom, a round step apart, covering every value. It
// hugs the data with a little room above (or runs from `yFrom` to `yTo` when given, like a pack that
// moves by tenths of a kWh drawn on a few kWh), rounded out to that step. `signed` centres it on zero.
export function lineAxis(ys: number[], { yFrom, yTo, signed = false }: { yFrom?: number; yTo?: number; signed?: boolean } = {}): LineAxis {
  const axis = (lo: number, hi: number, ticks: number[]) => ({ lo, hi, ticks, labels: axisLabels(ticks) });
  const dmin = Math.min(...ys);
  const dmax = Math.max(...ys);
  if (signed) {
    const reach = niceTop(Math.max(...ys.map(Math.abs)) * 1.1 || 1);
    return axis(-reach, reach, [reach, 0, -reach]);
  }
  let low = yFrom ?? dmin;
  let high = yTo ?? dmax + (dmax - low) * 0.1;
  // A flat line (the same value every week) gets 1 either side, so it sits in the middle. A spread that is
  // only float noise (two equal cell gaps worked out from floats differ by 1e-12) is flat too: its step would
  // round to 0 and the ticks to NaN, and the search below would never end.
  if (!(high - low > Math.max(1, Math.abs(low), Math.abs(high)) * 1e-9)) [low, high] = [low - 1, high + 1];
  // At most a few dozen widenings ever happen; the cap is a guard, not a limit the data reaches.
  for (let step = niceStep((high - low) / 2), tries = 0; tries < 60; step = niceStep(step * 1.001), tries++) {
    // From yFrom when only it is given (0 stays 0); otherwise centred on the span, and never below 0 for
    // data that isn't.
    const from = yFrom !== undefined && yTo === undefined;
    let lo = from ? Math.floor(yFrom / step + 1e-9) * step : Math.round(((low + high) / 2 - step) / step) * step;
    if (!from && dmin >= 0 && lo < 0) lo = 0;
    if (lo > dmin) lo = Math.floor(dmin / step + 1e-9) * step;
    const ticks = [lo + 2 * step, lo + step, lo].map(clean);
    if (ticks[0] >= dmax - 1e-9) return axis(ticks[2], ticks[0], ticks);
  }
  return axis(low, high, [high, (low + high) / 2, low]);
}
