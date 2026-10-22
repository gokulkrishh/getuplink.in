// Pure geometry for the headline's sparklines: one value per slot (see slotsFor), null where there is
// nothing to draw (a slot ahead of now, or a figure that couldn't be worked out). Each slot is SLOT_WIDTH
// wide in viewBox units; the SVG stretches to its cell.

export const SLOT_WIDTH = 10;
const BAR_WIDTH = 6;
// A bar above zero is at least this tall, so a small value still shows.
const MIN_BAR = 1.5;

// Whether a sparkline has anything to draw. Bars are totals, so a period of zeros (parked since
// tracking began) has nothing to chart; a line is a rate, null when there was nothing to rate.
export function hasSparkData(kind: "bars" | "line", values: (number | null)[]): boolean {
  return kind === "bars" ? values.some((v) => v !== null && v > 0) : values.some((v) => v !== null);
}

export type SparkBar = { k: number; x: number; y: number; width: number; height: number };

// Bars from a zero baseline at `height`, scaled to the largest value. Zero and null slots have no bar.
export function sparkBars(values: (number | null)[], height: number): SparkBar[] {
  const max = Math.max(0, ...values.map((v) => v ?? 0));
  if (max <= 0) return [];
  return values.flatMap((v, k) => {
    if (v === null || v <= 0) return [];
    const h = Math.max(MIN_BAR, (v / max) * height);
    return [{ k, x: k * SLOT_WIDTH + (SLOT_WIDTH - BAR_WIDTH) / 2, y: height - h, width: BAR_WIDTH, height: h }];
  });
}

// A line through each slot's centre, scaled between the smallest and largest value (a rate like Wh/km
// moves in a narrow band, so a zero baseline would flatten it), `pad` in from the top and bottom. Null
// slots break the line; a value with no neighbour is a short tick. Empty when there is nothing to draw.
export function sparkLine(values: (number | null)[], height: number, pad = 2): string {
  const known = values.filter((v): v is number => v !== null);
  if (known.length === 0) return "";
  const min = Math.min(...known);
  const range = Math.max(...known) - min;
  const y = (v: number) => (range === 0 ? height / 2 : pad + (1 - (v - min) / range) * (height - 2 * pad));
  const x = (k: number) => k * SLOT_WIDTH + SLOT_WIDTH / 2;
  const parts: string[] = [];
  values.forEach((v, k) => {
    if (v === null) return;
    const prev = k > 0 ? values[k - 1] : null;
    const next = k < values.length - 1 ? values[k + 1] : null;
    const point = `${round(x(k))} ${round(y(v))}`;
    if (prev !== null && prev !== undefined) parts.push(`L${point}`);
    else if (next === null || next === undefined) parts.push(`M${round(x(k) - 2)} ${round(y(v))}h4`);
    else parts.push(`M${point}`);
  });
  return parts.join("");
}

const round = (n: number) => Math.round(n * 100) / 100;
