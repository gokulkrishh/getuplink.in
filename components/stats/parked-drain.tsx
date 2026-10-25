import { ShowMore } from "@/components/show-more";
import { formatClock, formatDuration, formatPower, formatShortDate } from "@/lib/format";
import { type DrainSummary, drainSummary, type ParkedNow, type ParkedPeriod, type ParkStats } from "@/lib/drives";
import { backTo, overlapping } from "@/lib/kept";
import { LIST_PREVIEW } from "@/lib/list";
import type { Timeframe } from "@/lib/periods";
import { median } from "@/lib/telemetry-derive";

const HOUR = 3_600_000;
// A stretch this long says something per day; a shorter one in progress is shown but not summarised.
const SUMMARY_MS = 6 * HOUR;

const oneDecimal = (value: number) => (Math.round(value * 10) / 10).toString();
const dash = "Unknown";

type Row = ParkStats & { serial: number; ongoing: boolean; atLeast: boolean };

// The table's columns. Fixed widths, so a second table (behind Show more) lines up with the first.
const COLUMNS = [
  { label: "#", width: "w-10" },
  { label: "Parked", width: "w-32" },
  { label: "For", width: "w-28" },
  { label: "Lost", width: "", right: true },
  { label: "Range", width: "", right: true },
  { label: "Energy", width: "", right: true },
  { label: "Avg power", width: "", right: true },
  { label: "Seen awake", width: "w-24", right: true },
];

// The numbers of one stretch, each "Unknown" when the readings don't show it.
function cells(r: Row) {
  return {
    when: `${formatShortDate(r.start)}, ${formatClock(r.start)}`,
    period: `${r.atLeast ? "≥ " : ""}${formatDuration(r.hours * 3600)}`,
    lost: r.lostPercent !== null ? `${oneDecimal(r.lostPercent)}%` : dash,
    range: r.lostKm !== null ? `${Math.round(r.lostKm)} km` : dash,
    energy: r.kwh !== null ? `${oneDecimal(r.kwh)} kWh` : dash,
    power: r.watts !== null ? formatPower(r.watts) : dash,
    awake: formatDuration(r.awakeMs / 1000),
  };
}

// The stretch going on now says so under when it began, rather than in its length.
const Now = ({ row }: { row: Row }) => (row.ongoing ? <span className="block text-xs text-muted-foreground">Still parked</span> : null);

function Table({ rows, header = true }: { rows: Row[]; header?: boolean }) {
  return (
    <table className="w-full table-fixed text-sm tabular-nums">
      <colgroup>
        {COLUMNS.map((c) => (
          <col key={c.label} className={c.width} />
        ))}
      </colgroup>
      {header && (
        <thead>
          <tr className="border-b text-left text-xs text-faint">
            {COLUMNS.map((c, k) => (
              <th key={c.label} scope="col" className={`py-2 font-normal ${c.right ? "text-right" : ""} ${k < COLUMNS.length - 1 ? "pr-3" : ""}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
      )}
      <tbody className={`divide-y ${header ? "" : "border-t"}`}>
        {rows.map((r) => {
          const c = cells(r);
          return (
            <tr key={r.start} className="align-top">
              <td className="py-2.5 pr-3 font-mono text-xs text-faint">{r.serial}</td>
              <td className="py-2.5 pr-3 whitespace-nowrap">
                {c.when}
                <Now row={r} />
              </td>
              <td className="py-2.5 pr-3 whitespace-nowrap text-muted-foreground">{c.period}</td>
              <td className="py-2.5 pr-3 text-right font-mono">{c.lost}</td>
              <td className="py-2.5 pr-3 text-right font-mono">{c.range}</td>
              <td className="py-2.5 pr-3 text-right font-mono">{c.energy}</td>
              <td className="py-2.5 pr-3 text-right font-mono">{c.power}</td>
              <td className="py-2.5 text-right font-mono whitespace-nowrap">{c.awake}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// Phones: one block per stretch, its figures labelled in two columns.
function Blocks({ rows }: { rows: Row[] }) {
  return (
    <ul className="divide-y border-t">
      {rows.map((r) => {
        const c = cells(r);
        const figures = [
          ["Lost", r.lostKm !== null ? `${c.lost} · ${c.range}` : c.lost],
          ["Energy", c.energy],
          ["Avg power", c.power],
          ["Seen awake", c.awake],
        ];
        return (
          <li key={r.start} className="space-y-3 py-4 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="tabular-nums">
                <span className="mr-2 font-mono text-xs text-faint">#{r.serial}</span>
                {c.when}
                <Now row={r} />
              </p>
              <span className="text-muted-foreground tabular-nums">{c.period}</span>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              {figures.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-faint">{label}</dt>
                  <dd className="tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </li>
        );
      })}
    </ul>
  );
}

// Battery lost while parked, after TeslaMate's vampire drain, over the span: a headline of average power and
// loss per day, then each stretch parked that overlaps the span (the one going on now first) with what it
// lost, the energy drained, the average power, and how long the car was seen awake. Stretches are kept for
// the last 30 days. Numbers count from the oldest stretch kept, so each keeps its number in any span.
// Power is the clearest sign: a car that sleeps draws little; Sentry Mode, cabin overheat protection and apps
// checking in keep it awake.
export function ParkedDrain({ parked, parkedNow, frame }: { parked: ParkedPeriod[]; parkedNow: ParkedNow | null; frame: Timeframe }) {
  if (parked.length === 0 && !parkedNow) return null;
  const { span } = frame;
  const finished = overlapping(parked, span, (p) => p.start, (p) => p.end);
  const ongoing = parkedNow && parkedNow.start < span.to && parkedNow.end >= span.from ? parkedNow : null;
  const serial = new Map(parked.map((p, i) => [p.start, i + 1]));
  const rows: Row[] = [
    ...(ongoing ? [{ ...ongoing, serial: parked.length + 1, ongoing: true, atLeast: ongoing.fromFirstReading }] : []),
    ...[...finished].reverse().map((p) => ({ ...p, serial: serial.get(p.start) ?? 0, ongoing: false, atLeast: false })),
  ];

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
        basis: `Median of ${finished.length} stretches parked 6 hours or more, ${frame.words}.`,
      }
    : now && now.lostPercent !== null
      ? {
          watts: now.watts,
          perDay: (now.lostPercent / now.hours) * 24,
          kmPerDay: now.lostKm !== null ? (now.lostKm / now.hours) * 24 : null,
          basis: "From the stretch the car is parked in now. A median shows after two finished stretches of 6 hours or more.",
        }
      : null;
  const first = Math.min(parked[0]?.start ?? Infinity, parkedNow?.start ?? Infinity);
  const cut = backTo(span, first, "Stretches");

  return (
    <section className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-lg font-medium tracking-heading">Parked drain</h2>
        {headline && (
          <>
            {/* The label wraps as a whole under the figure on a phone, rather than splitting across the big line. */}
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-mono text-4xl font-medium tracking-tight tabular-nums">
                {headline.watts !== null ? formatPower(headline.watts) : `${oneDecimal(headline.perDay)}%`}
              </span>
              <span className="text-base text-muted-foreground">{headline.watts !== null ? "average while parked" : "a day"}</span>
            </p>
            <p className="text-sm text-muted-foreground tabular-nums">
              {[
                headline.watts !== null && `${oneDecimal(headline.perDay)}% a day`,
                headline.kmPerDay !== null && headline.kmPerDay >= 1 && `about ${Math.round(headline.kmPerDay)} km a day`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="text-xs text-faint">{headline.basis}</p>
          </>
        )}
        <p className="text-xs text-muted-foreground">A sleeping car draws little. Sentry Mode, cabin overheat protection and apps checking in keep it awake and raise this.</p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No stretches parked 6 hours or more {frame.words}.</p>
      ) : (
        <div>
          <div className="sm:hidden">
            <Blocks rows={rows.slice(0, LIST_PREVIEW)} />
            {rows.length > LIST_PREVIEW && (
              <ShowMore count={rows.length - LIST_PREVIEW}>
                <Blocks rows={rows.slice(LIST_PREVIEW)} />
              </ShowMore>
            )}
          </div>
          {/* Wider screens: a table, like TeslaMate's. */}
          <div className="hidden overflow-x-auto sm:block">
            <Table rows={rows.slice(0, LIST_PREVIEW)} />
            {rows.length > LIST_PREVIEW && (
              <ShowMore count={rows.length - LIST_PREVIEW}>
                <Table rows={rows.slice(LIST_PREVIEW)} header={false} />
              </ShowMore>
            )}
          </div>
        </div>
      )}
      <p className="text-xs text-faint">
        {cut && `${cut} `}Energy is what the pack lost; average power is that over the time parked. Seen awake counts only the time the car was sending data, so
        it&apos;s a minimum. ≥ means parked since before Uplink&apos;s first reading.
      </p>
    </section>
  );
}
