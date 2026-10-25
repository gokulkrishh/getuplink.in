import { Bars } from "@/components/stats/bars";
import { Figures } from "@/components/stats/figures";
import { type DriveStats } from "@/lib/drive-stats";
import { formatDuration, formatKwh, formatShortDate } from "@/lib/format";
import type { DrivingFigures } from "@/lib/driving-figures";
import { type Period, PERIOD_WORDS, SLOT_NAMES, slotsFor } from "@/lib/periods";
import type { DayKm } from "@/lib/telemetry-derive";

// The Driving page's sections: distance per month and per day, and energy use with regen.

const compactNumber = new Intl.NumberFormat("en-IN");
const kwhCompact = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

// Distance for the period, with a bar per day (Week), month or year.
export function Distance({ figures, now, period }: { figures: DrivingFigures; now: number; period: Period }) {
  const { current, bars: values } = figures.periods[period];
  // A period without driving still shows, at 0 km with a note in place of the chart, so picking Day before
  // the first drive of the day doesn't leave a blank gap.
  const bars = slotsFor(period, now).map((slot, k) => {
    const value = values[k].km ?? 0;
    return { key: String(slot.id), label: slot.label, value, display: compactNumber.format(value), isCurrent: slot.isCurrent };
  });
  return (
    <section className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-xs font-medium tracking-wide text-faint uppercase">Distance</h2>
        <p className="font-mono text-4xl font-medium tracking-tight tabular-nums">{compactNumber.format(current.km ?? 0)} km</p>
        <p className="text-sm text-muted-foreground">{PERIOD_WORDS[period]}</p>
      </div>
      <Bars bars={bars} ariaLabel={`Distance per ${SLOT_NAMES[period]}`} unit="km" empty={`No driving ${PERIOD_WORDS[period]}`} />
    </section>
  );
}

// Energy used driving in the period and each bar, in kWh: from the streamed lifetime energy counter, or
// from the drives where the counter has no reading from before the span (see withDriveEfficiency).
export function EnergyUse({ figures, now, period }: { figures: DrivingFigures; now: number; period: Period }) {
  const { current, bars: values } = figures.periods[period];
  // No reading with no driving is nothing used; with driving it's unknown, so the section stays out of the way.
  const used = current.kwh ?? (current.km ? null : 0);
  if (used === null) return null;
  const slots = slotsFor(period, now);
  const bars = slots.map((slot, k) => {
    const value = values[k].kwh ?? 0;
    return { key: String(slot.id), label: slot.label, value, display: oneDecimal.format(value), isCurrent: slot.isCurrent };
  });
  const regenBars = slots.map((slot, k) => {
    const value = values[k].regenKwh ?? 0;
    return { key: String(slot.id), label: slot.label, value, display: kwhCompact.format(value), isCurrent: slot.isCurrent };
  });
  const regenTotal = current.regenKwh ?? 0;
  return (
    <section className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-xs font-medium tracking-wide text-faint uppercase">Energy use</h2>
        <p className="font-mono text-4xl font-medium tracking-tight tabular-nums">{formatKwh(used)}</p>
        <p className="text-sm text-muted-foreground tabular-nums">
          Used {PERIOD_WORDS[period]}
          {current.km ? ` · ${compactNumber.format(current.km)} km` : ""}
        </p>
      </div>
      <Bars bars={bars} ariaLabel={`Energy used per ${SLOT_NAMES[period]} in kWh`} unit="kWh" empty={`No driving ${PERIOD_WORDS[period]}`} />
      {regenTotal > 0 && (
        <div className="space-y-4">
          <p className="text-sm">
            Regen won back <span className="font-mono font-medium tabular-nums">{formatKwh(regenTotal)}</span>{" "}
            <span className="text-muted-foreground">{PERIOD_WORDS[period]}</span>
          </p>
          <Bars bars={regenBars} ariaLabel={`Energy won back by regen per ${SLOT_NAMES[period]} in kWh`} unit="kWh" />
        </div>
      )}
    </section>
  );
}

// Kilometres per day for the last 90 days, from the streamed odometer; 30 fit the panel and the rest scroll.
export function DailyDriving({ days }: { days: DayKm[] }) {
  // One day of readings has nothing to compare against, so the section waits for a second.
  if (days.filter((d) => d.km !== null).length < 2) return null;
  const total = days.slice(-30).reduce((sum, d) => sum + (d.km ?? 0), 0);
  const bars = days.map((d, k) => ({
    key: String(d.day),
    label: formatShortDate(d.start),
    value: d.km ?? 0,
    display: compactNumber.format(d.km ?? 0),
    isCurrent: k === days.length - 1,
    blank: d.km === null,
  }));
  return (
    <section className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-xs font-medium tracking-wide text-faint uppercase">Driving per day</h2>
        <p className="text-sm text-muted-foreground tabular-nums">{compactNumber.format(total)} km in the last 30 days</p>
      </div>
      <Bars bars={bars} ariaLabel="Distance per day" labelEvery={7} visible={30} unit="km" />
    </section>
  );
}

const oneDecimal = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

// Drive stats for the last 90 days (or since tracking began), after TeslaMate's: how many drives, how
// long they usually are, the longest, time at the wheel and distance a day. Counted, never projected.
export function DriveStatsSection({ stats }: { stats: DriveStats | null }) {
  if (!stats) return null;
  const rows: [string, string][] = [
    ["Trips", compactNumber.format(stats.trips)],
    ["Drives", compactNumber.format(stats.drives)],
    ["Distance", `${compactNumber.format(Math.round(stats.km))} km`],
    ["Typical drive", `${oneDecimal.format(stats.medianKm)} km`],
    ["Longest drive", `${oneDecimal.format(stats.longestKm)} km`],
    ["Time driving", formatDuration(stats.hours * 3600)],
    ["Distance a day", `${oneDecimal.format(stats.kmPerDay)} km`],
  ];
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-xs font-medium tracking-wide text-faint uppercase">Drive stats</h2>
        <p className="text-sm text-muted-foreground">
          {stats.days >= 89 ? "Last 90 days" : `Since tracking began, ${Math.max(1, Math.round(stats.days))} ${Math.round(stats.days) === 1 ? "day" : "days"}`}. Typical drive is the median.
        </p>
      </div>
      <Figures figures={rows.map(([label, value]) => ({ label, value }))} />
    </section>
  );
}
