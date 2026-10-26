import { ShowMore } from "@/components/show-more";
import { Value } from "@/components/stats/figures";
import { formatClock, formatDuration, formatKwh, formatNumber, formatPower, formatRangeKm, formatShortDate } from "@/lib/format";
import { type DrainSummary, drainSummary, type ParkedNow, type ParkedPeriod, type ParkStats } from "@/lib/drives";
import { backTo, overlapping } from "@/lib/kept";
import { LIST_PREVIEW } from "@/lib/list";
import type { Timeframe } from "@/lib/periods";
import { median } from "@/lib/telemetry-derive";
import { InfoButton } from "@/components/info-button";
import { type ParkedRow, ParkedBlocks, ParkedTable } from "@/components/stats/parked-rows";
import type { SpotName } from "@/lib/charge-names";

const HOUR = 3_600_000;
// A stretch this long says something per day; a shorter one in progress is shown but not summarised.
const SUMMARY_MS = 6 * HOUR;

const oneDecimal = (value: number) => formatNumber(value, 1);
const dash = "Unknown";

type Row = ParkStats & { serial: number; ongoing: boolean; atLeast: boolean };

// The texts of one stretch for the list (see ParkedRows), each "Unknown" when the readings don't show it.
function cells(r: Row, place: string | null): ParkedRow {
  const lost = r.lostPercent !== null ? `${oneDecimal(r.lostPercent)}%` : dash;
  const range = r.lostKm !== null ? formatRangeKm(r.lostKm) : dash;
  return {
    start: r.start,
    serial: r.serial,
    ongoing: r.ongoing,
    when: `${formatShortDate(r.start)}, ${formatClock(r.start)}`,
    place,
    period: `${r.atLeast ? "≥ " : ""}${formatDuration(r.hours * 3600)}`,
    lost,
    lostWithRange: r.lostKm !== null ? `${lost} · ${range}` : lost,
    range,
    energy: r.kwh !== null ? formatKwh(r.kwh) : dash,
    power: r.watts !== null ? formatPower(r.watts) : dash,
    awake: formatDuration(r.awakeMs / 1000),
  };
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
}: {
  parked: ParkedPeriod[];
  parkedNow: ParkedNow | null;
  frame: Timeframe;
  places?: Readonly<Record<number, SpotName>>;
}) {
  if (parked.length === 0 && !parkedNow) return null;
  const { span } = frame;
  const finished = overlapping(parked, span, (p) => p.start, (p) => p.end);
  const ongoing = parkedNow && parkedNow.start < span.to && parkedNow.end >= span.from ? parkedNow : null;
  const serial = new Map(parked.map((p, i) => [p.start, i + 1]));
  const rows: Row[] = [
    ...(ongoing ? [{ ...ongoing, serial: parked.length + 1, ongoing: true, atLeast: ongoing.fromFirstReading }] : []),
    ...[...finished].reverse().map((p) => ({ ...p, serial: serial.get(p.start) ?? 0, ongoing: false, atLeast: false })),
  ];

  // The phone blocks and the table share one set of texts, drawn in the browser (see ParkedRows).
  const texts = rows.map((r) => cells(r, places[r.start]?.name?.text ?? null));

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
        basis: `The headline is the median of ${finished.length} stretches parked 6 hours or more, ${frame.words}.`,
      }
    : now && now.lostPercent !== null
      ? {
          watts: now.watts,
          perDay: (now.lostPercent / now.hours) * 24,
          kmPerDay: now.lostKm !== null ? (now.lostKm / now.hours) * 24 : null,
          basis: "The headline is from the stretch the car is parked in now. A median shows after two finished stretches of 6 hours or more.",
        }
      : null;
  const first = Math.min(parked[0]?.start ?? Infinity, parkedNow?.start ?? Infinity);
  const cut = backTo(span, first, "Stretches");

  return (
    <section className="space-y-8">
      <div className="space-y-2">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <h2 className="text-lg font-medium tracking-heading">Parked drain</h2>
            <InfoButton label="Parked drain" terms={["% a day", "W", "kWh"]}>
              {headline && <p>{headline.basis}</p>}
              <p>Energy is what the pack lost. Average power is that energy over the time parked.</p>
              <p>Seen awake counts only the time the car was sending data, so it&apos;s a minimum.</p>
              <p>≥ means parked since before Uplink&apos;s first reading.</p>
            </InfoButton>
          </div>
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
        <p className="text-xs text-muted-foreground">Sentry Mode and apps checking in keep the car awake and raise this.</p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No stretches parked 6 hours or more {frame.words}.</p>
      ) : (
        <div>
          <div className="sm:hidden">
            <ParkedBlocks rows={texts.slice(0, LIST_PREVIEW)} />
            {rows.length > LIST_PREVIEW && (
              <ShowMore count={rows.length - LIST_PREVIEW}>
                <ParkedBlocks rows={texts.slice(LIST_PREVIEW)} />
              </ShowMore>
            )}
          </div>
          {/* Wider screens: a table, like TeslaMate's. */}
          <div className="hidden overflow-x-auto sm:block">
            <ParkedTable rows={texts.slice(0, LIST_PREVIEW)} />
            {rows.length > LIST_PREVIEW && (
              <ShowMore count={rows.length - LIST_PREVIEW}>
                <ParkedTable rows={texts.slice(LIST_PREVIEW)} header={false} />
              </ShowMore>
            )}
          </div>
        </div>
      )}
      {cut && <p className="text-xs text-faint">{cut}</p>}
    </section>
  );
}
