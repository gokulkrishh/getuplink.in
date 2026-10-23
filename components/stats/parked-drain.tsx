import { formatClock, formatDuration, formatShortDate } from "@/lib/format";
import type { DrainSummary, ParkedNow, ParkedPeriod, ParkStats } from "@/lib/drives";
import { median } from "@/lib/telemetry-derive";

const LISTED = 10;
const HOUR = 3_600_000;
// A stretch this long says something per day; a shorter one in progress is shown but not summarised.
const SUMMARY_MS = 6 * HOUR;

const oneDecimal = (value: number) => (Math.round(value * 10) / 10).toString();
// Power in kW, like charging: parked draw is small, so three decimals ("0.017 kW").
export const kw = (watts: number) => `${(watts / 1000).toFixed(watts < 1000 ? 3 : 1)} kW`;
const dash = "Unknown";

type Row = ParkStats & { ongoing: boolean; atLeast: boolean };

// The numbers of one stretch, each "–" when the readings don't show it.
function cells(r: Row) {
  return {
    when: `${formatShortDate(r.start)}, ${formatClock(r.start)}`,
    period: `${r.atLeast ? "≥ " : ""}${formatDuration(r.hours * 3600)}${r.ongoing ? " so far" : ""}`,
    lost: r.lostPercent !== null ? `${oneDecimal(r.lostPercent)}%` : dash,
    range: r.lostKm !== null ? `${Math.round(r.lostKm)} km` : dash,
    energy: r.kwh !== null ? `${oneDecimal(r.kwh)} kWh` : dash,
    power: r.watts !== null ? kw(r.watts) : dash,
    awake: formatDuration(r.awakeMs / 1000),
  };
}

// Battery lost while parked, after TeslaMate's vampire drain: a headline of average power and loss per
// day, then each stretch parked (the one going on now first) with what it lost, the energy drained, the
// average power, and how long the car was seen awake. Power is the clearest sign: a car that sleeps
// draws little; Sentry Mode, cabin overheat protection and apps checking in keep it awake.
export function ParkedDrain({ drain, parked, parkedNow }: { drain: DrainSummary | null; parked: ParkedPeriod[]; parkedNow: ParkedNow | null }) {
  const rows: Row[] = [
    ...(parkedNow ? [{ ...parkedNow, ongoing: true, atLeast: parkedNow.fromFirstReading }] : []),
    ...parked
      .slice(-LISTED)
      .reverse()
      .map((p) => ({ ...p, ongoing: false, atLeast: false })),
  ];
  if (rows.length === 0) return null;

  // The median of finished stretches once there are two; until then the one going on now, if it's long
  // enough to say anything per day.
  const watts = parked.flatMap((p) => (p.watts === null ? [] : [p.watts]));
  const now = parkedNow && parkedNow.end - parkedNow.start >= SUMMARY_MS ? parkedNow : null;
  const headline = drain
    ? {
        watts: watts.length >= 2 ? median(watts) : null,
        perDay: drain.percentPerDay,
        kmPerDay: drain.kmPerDay,
        basis: `Median of ${parked.length} stretches parked 6 hours or more, last 30 days`,
      }
    : now && now.lostPercent !== null
      ? {
          watts: now.watts,
          perDay: (now.lostPercent / now.hours) * 24,
          kmPerDay: now.lostKm !== null ? (now.lostKm / now.hours) * 24 : null,
          basis: "Parked now, so far. A median shows after two finished stretches of 6 hours or more.",
        }
      : null;

  return (
    <section className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-xs font-medium tracking-wide text-faint uppercase">Parked drain</h2>
        {headline && (
          <>
            <p className="font-mono text-4xl font-medium tracking-tight tabular-nums">
              {headline.watts !== null ? kw(headline.watts) : `${oneDecimal(headline.perDay)}%`}
              <span className="ml-2 font-sans text-base font-normal tracking-normal text-muted-foreground">{headline.watts !== null ? "average while parked" : "a day"}</span>
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

      {/* Phones: one block per stretch. */}
      <ul className="divide-y border-t sm:hidden">
        {rows.map((r) => {
          const c = cells(r);
          return (
            <li key={r.start} className="space-y-1 py-3 text-sm">
              <p className="flex justify-between gap-3">
                <span className="tabular-nums">{c.when}</span>
                <span className="text-muted-foreground tabular-nums">{c.period}</span>
              </p>
              <p className="font-mono text-xs text-muted-foreground tabular-nums">
                {[c.lost, c.range, c.energy, c.power].join(" · ")} · awake {c.awake}
              </p>
            </li>
          );
        })}
      </ul>

      {/* Wider screens: a table, like TeslaMate's. */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-b text-left text-xs text-faint">
              {["Parked", "For", "Lost", "Range", "Energy", "Avg power", "Seen awake"].map((h, k) => (
                <th key={h} scope="col" className={`py-2 font-normal ${k > 1 ? "text-right" : ""} ${k < 6 ? "pr-4" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => {
              const c = cells(r);
              return (
                <tr key={r.start}>
                  <td className="py-2.5 pr-4 whitespace-nowrap">{c.when}</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap text-muted-foreground">{c.period}</td>
                  <td className="py-2.5 pr-4 text-right font-mono">{c.lost}</td>
                  <td className="py-2.5 pr-4 text-right font-mono">{c.range}</td>
                  <td className="py-2.5 pr-4 text-right font-mono">{c.energy}</td>
                  <td className="py-2.5 pr-4 text-right font-mono">{c.power}</td>
                  <td className="py-2.5 text-right font-mono whitespace-nowrap">{c.awake}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-faint">
        Energy is what the pack lost; average power is that over the time parked. Seen awake counts only the time the car was sending data, so it&apos;s a minimum. ≥ means
        parked since before Uplink&apos;s first reading.
      </p>
    </section>
  );
}
