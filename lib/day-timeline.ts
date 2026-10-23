import { istDay, istDayStart } from "@/lib/telemetry-derive";

// A day as one strip, after TeslaMate's timeline: driving, charging, asleep and parked, painted in that
// order of precedence over the time Uplink was tracking. Before tracking began is unknown. Pure.

export type DayKind = "driving" | "charging" | "asleep" | "parked" | "unknown";
export type DaySegment = { kind: DayKind; start: number; end: number };
export type Day = { day: number; start: number; segments: DaySegment[] };
type Span = { start: number; end: number };

const DAY = 86_400_000;

// "2026-10-23", a day's page address (/stats/day/2026-10-23), in IST.
export const dayParam = (day: number) => new Date(istDayStart(day) + 12 * 3_600_000).toISOString().slice(0, 10);

// Paints `span` over the segments, splitting any it covers.
function paint(segments: DaySegment[], span: Span, kind: DayKind): DaySegment[] {
  const out: DaySegment[] = [];
  for (const s of segments) {
    if (span.end <= s.start || span.start >= s.end) {
      out.push(s);
      continue;
    }
    if (span.start > s.start) out.push({ ...s, end: span.start });
    out.push({ kind, start: Math.max(s.start, span.start), end: Math.min(s.end, span.end) });
    if (span.end < s.end) out.push({ ...s, start: span.end });
  }
  return out;
}

// Merges neighbours of the same kind.
const merge = (segments: DaySegment[]) =>
  segments.reduce<DaySegment[]>((out, s) => {
    const last = out.at(-1);
    if (last && last.kind === s.kind && last.end === s.start) last.end = s.end;
    else if (s.end > s.start) out.push({ ...s });
    return out;
  }, []);

// The last `days` IST days, oldest first, up to now.
export function dayStrips(days: number, layers: { driving: Span[]; charging: Span[]; asleep: Span[] }, trackingFrom: number | null, now: number): Day[] {
  const today = istDay(now);
  return Array.from({ length: days }, (_, k) => {
    const day = today - days + 1 + k;
    const start = istDayStart(day);
    const end = Math.min(start + DAY, now);
    let segments: DaySegment[] = [{ kind: trackingFrom === null || trackingFrom >= end ? "unknown" : "parked", start, end }];
    if (trackingFrom !== null && trackingFrom > start && trackingFrom < end) segments = paint(segments, { start, end: trackingFrom }, "unknown");
    const tracked = (s: Span) => (trackingFrom === null ? s : { start: Math.max(s.start, trackingFrom), end: s.end });
    for (const s of layers.asleep) segments = paint(segments, tracked(s), "asleep");
    for (const s of layers.charging) segments = paint(segments, tracked(s), "charging");
    for (const s of layers.driving) segments = paint(segments, tracked(s), "driving");
    return { day, start, segments: merge(segments) };
  });
}
