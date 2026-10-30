import { Value } from "@/components/stats/figures";
import { HIDDEN_PLACE, type Shown, SHOWS_ALL } from "@/lib/view-links";
import { formatClock, formatDuration, formatKwh, formatNumber, formatPower, formatRangeKm, formatShortDate } from "@/lib/format";
import { type DrainSummary, drainSummary, type ParkedNow, type ParkedPeriod, type ParkStats } from "@/lib/drives";
import { backTo, overlapping } from "@/lib/kept";
import { type LoadMore, paged } from "@/lib/list";
import type { Span, Timeframe } from "@/lib/periods";
import { median } from "@/lib/telemetry-derive";
import { type ParkedRow, ParkedRows } from "@/components/stats/parked-rows";
import { type ShownName, shownName, type SpotName } from "@/lib/charge-names";

const HOUR = 3_600_000;
// A stretch this long says something per day; a shorter one in progress is shown but not summarised.
const SUMMARY_MS = 6 * HOUR;

const oneDecimal = (value: number) => formatNumber(value, 1);
const dash = "Unknown";

type Row = ParkStats & { serial: number; ongoing: boolean; atLeast: boolean };

// The texts of one stretch for the list (see ParkedRows), each "Unknown" when the readings don't show it.
function cells(r: Row, place: ShownName | null): ParkedRow {
  const lost = r.lostPercent !== null ? `${oneDecimal(r.lostPercent)}%` : dash;
  const range = r.lostKm !== null ? formatRangeKm(r.lostKm) : dash;
  return {
    start: r.start,
    serial: r.serial,
    ongoing: r.ongoing,
    when: `${formatShortDate(r.start)}, ${formatClock(r.start)}`,
    place: place?.text ?? null,
    placeGoogle: place?.google ?? false,
    period: `${r.atLeast ? "≥ " : ""}${formatDuration(r.hours * 3600)}`,
    lost,
    lostWithRange: r.lostKm !== null ? `${lost} · ${range}` : lost,
    range,
    energy: r.kwh !== null ? formatKwh(r.kwh) : dash,
    power: r.watts !== null ? formatPower(r.watts) : dash,
    awake: formatDuration(r.awakeMs / 1000),
  };
}

// The stretches overlapping the span, as the list shows them: the one going on now, then the finished ones,
// newest first, numbered from 1 from the top. The page and "Show N more" (see moreParked) both draw from this.
// `shown`: a guest whose link hides locations gets "Hidden" as each stretch's place.
export function stretches(parked: ParkedPeriod[], parkedNow: ParkedNow | null, span: Span, places: Readonly<Record<number, SpotName>>, shown: Shown = SHOWS_ALL) {
  const finished = overlapping(parked, span, (p) => p.start, (p) => p.end);
  const ongoing = parkedNow && parkedNow.start < span.to && parkedNow.end >= span.from ? parkedNow : null;
  const rows: Row[] = [
    ...(ongoing ? [{ ...ongoing, ongoing: true, atLeast: ongoing.fromFirstReading }] : []),
    ...[...finished].reverse().map((p) => ({ ...p, ongoing: false, atLeast: false })),
  ].map((r, i) => ({ ...r, serial: i + 1 }));
  const texts = rows.map((r) => (shown.locations ? cells(r, shownName(places[r.start])) : { ...cells(r, null), place: HIDDEN_PLACE, placeGoogle: false }));
  return { finished, ongoing, rows, texts };
}

// Battery lost while parked, after TeslaMate's vampire drain, over the span: a headline of average power and
// loss per day, then each stretch parked that overlaps the span (the one going on now first) with what it
// lost, the energy drained, the average power, and how long the car was seen awake. Stretches are kept for
// the last 30 days. Numbers count from the oldest stretch kept, so each keeps its number in any span.
// Power is the clearest sign: a car that sleeps draws little; Sentry Mode, cabin overheat protection and apps
// checking in keep it awake.
// places: each stretch's place by its start (see loadParkedPlaces), when known.
export function ParkedDrain({
  parked,
  parkedNow,
  frame,
  places = {},
  more,
  shown = SHOWS_ALL,
}: {
  parked: ParkedPeriod[];
  parkedNow: ParkedNow | null;
  frame: Timeframe;
  places?: Readonly<Record<number, SpotName>>;
  more: LoadMore<ParkedRow>;
  shown?: Shown;
}) {
  if (parked.length === 0 && !parkedNow) return null;
  const { finished, ongoing, rows, texts } = stretches(parked, parkedNow, frame.span, places, shown);

  // The median of finished stretches in the span once there are two; until then the one going on now, if
  // it's long enough to say anything per day.
  const drain: DrainSummary | null = drainSummary(finished);
  const watts = finished.flatMap((p) => (p.watts === null ? [] : [p.watts]));
  const now = ongoing && ongoing.end - ongoing.start >= SUMMARY_MS ? ongoing : null;
  const headline = drain
    ? {
        watts: watts.length >= 2 ? median(watts) : null,
        perDay: drain.percentPerDay,
        kmPerDay: drain.kmPerDay,
      }
    : now && now.lostPercent !== null
      ? {
          watts: now.watts,
          perDay: (now.lostPercent / now.hours) * 24,
          kmPerDay: now.lostKm !== null ? (now.lostKm / now.hours) * 24 : null,
        }
      : null;
  const first = Math.min(parked[0]?.start ?? Infinity, parkedNow?.start ?? Infinity);
  const cut = backTo(frame.span, first, "Stretches");

  return (
    <section className="space-y-8">
      <div className="space-y-2">
        <div className="space-y-1">
          <h2 className="text-lg font-medium tracking-heading">Parked drain</h2>
          <p className="text-sm text-muted-foreground">Battery lost while parked. Lower is better.</p>
        </div>
        {headline && (
          <>
            {/* The label wraps as a whole under the figure on a phone, rather than splitting across the big line. */}
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-mono text-4xl font-medium tracking-tight tabular-nums">
                <Value text={headline.watts !== null ? formatPower(headline.watts) : `${oneDecimal(headline.perDay)}%`} />
              </span>
              <span className="text-base text-muted-foreground">{headline.watts !== null ? "average while parked" : "a day"}</span>
            </p>
            <p className="text-sm text-muted-foreground tabular-nums">
              {[
                headline.watts !== null && `${oneDecimal(headline.perDay)}% a day`,
                headline.kmPerDay !== null && headline.kmPerDay >= 1 && `about ${formatRangeKm(headline.kmPerDay)} a day`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No stretches parked 6 hours or more.</p>
      ) : (
        <ParkedRows list={paged(texts)} load={more} />
      )}
      {rows.some((r) => r.atLeast) && <p className="text-xs text-faint">≥ means parked since before tracking started.</p>}
      {cut && <p className="text-xs text-faint">{cut}</p>}
    </section>
  );
}
