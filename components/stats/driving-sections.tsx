import { Bars } from "@/components/stats/bars";
import { barsCaption, unitNotes } from "@/components/stats/chart-caption";
import { Figures, Value } from "@/components/stats/figures";
import { type DriveStats } from "@/lib/drive-stats";
import { DRIVE_DAYS } from "@/lib/drives";
import { formatDuration, formatKwh, formatShortDate } from "@/lib/format";
import type { Frame } from "@/lib/frames";
import { inSpan, type Timeframe } from "@/lib/periods";
import type { DayKm } from "@/lib/telemetry-derive";
import { Measure } from "@/components/measure";

// The Driving page's sections: distance per month and per day, and energy use with regen.

const compactNumber = new Intl.NumberFormat("en-IN");
const kwhCompact = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

// Distance for the period or range, with a bar per slot of it (see Timeframe).
export function Distance({ frame, driving }: Frame) {
  // The counters couldn't be read for a range picked by date: say so rather than show 0 km.
  if (!driving) return <Unread title="Distance" frame={frame} />;
  const { current, bars: values } = driving;
  // A period without driving still shows, at 0 km with a note in place of the chart, so picking Day before
  // the first drive of the day doesn't leave a blank gap.
  const bars = frame.slots.map((slot, k) => {
    const value = values[k]?.km ?? 0;
    return { key: String(slot.id), label: slot.label, value, display: compactNumber.format(value), isCurrent: slot.isCurrent };
  });
  return (
    <section className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-lg font-medium tracking-heading">Distance</h2>
        <p className="font-mono text-4xl font-medium tracking-tight tabular-nums">
          <Value text={`${compactNumber.format(current.km ?? 0)} km`} />
        </p>
        <p className="text-sm text-muted-foreground">{frame.words}</p>
      </div>
      <Bars
        bars={bars}
        ariaLabel={`Distance per ${frame.slotName}`}
        unit="km"
        labelEvery={frame.labelEvery}
        empty={`No driving ${frame.words}`}
        caption={barsCaption("Kilometres driven", frame)}
      />
    </section>
  );
}

function Unread({ title, frame }: { title: string; frame: Timeframe }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-medium tracking-heading">{title}</h2>
      <p className="text-sm text-muted-foreground">Couldn&apos;t read the car&apos;s counters {frame.words}.</p>
    </section>
  );
}

// Energy used driving in the period and each bar, in kWh: from the streamed lifetime energy counter, or
// from the drives where the counter has no reading from before the span (see withDriveEfficiency).
export function EnergyUse({ frame, driving }: Frame) {
  if (!driving) return null;
  const { current, bars: values } = driving;
  // No reading with no driving is nothing used; with driving it's unknown, so the section stays out of the way.
  const used = current.kwh ?? (current.km ? null : 0);
  if (used === null) return null;
  const slots = frame.slots;
  const bars = slots.map((slot, k) => {
    const value = values[k]?.kwh ?? 0;
    return { key: String(slot.id), label: slot.label, value, display: oneDecimal.format(value), isCurrent: slot.isCurrent };
  });
  const regenBars = slots.map((slot, k) => {
    const value = values[k]?.regenKwh ?? 0;
    return { key: String(slot.id), label: slot.label, value, display: kwhCompact.format(value), isCurrent: slot.isCurrent };
  });
  const regenTotal = current.regenKwh ?? 0;
  return (
    <section className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-lg font-medium tracking-heading">Energy use</h2>
        <p className="font-mono text-4xl font-medium tracking-tight tabular-nums">
          <Value text={formatKwh(used)} />
        </p>
        <p className="text-sm text-muted-foreground tabular-nums">
          Used {frame.words}
          {current.km ? ` · ${compactNumber.format(current.km)} km` : ""}
        </p>
      </div>
      <Bars
        bars={bars}
        ariaLabel={`Energy used per ${frame.slotName} in kWh`}
        unit="kWh"
        labelEvery={frame.labelEvery}
        empty={`No driving ${frame.words}`}
        caption={`${barsCaption("Energy the car used driving", frame)}. ${unitNotes(["kWh"])}`}
      />
      {regenTotal > 0 && (
        <div className="space-y-4">
          <p className="text-sm">
            Regen won back <span className="font-mono font-medium tabular-nums"><Measure text={formatKwh(regenTotal)} /></span>{" "}
            <span className="text-muted-foreground">{frame.words}</span>
          </p>
          <Bars
            bars={regenBars}
            ariaLabel={`Energy won back by regen per ${frame.slotName} in kWh`}
            unit="kWh"
            labelEvery={frame.labelEvery}
            caption={`${barsCaption("Energy won back by regen", frame)}, in kWh. Regen is the motor charging the battery as the car slows.`}
          />
        </div>
      )}
    </section>
  );
}

// Kilometres per day for the last 90 days, from the streamed odometer; 30 fit the panel and the rest scroll.
// With `frame` (a range picked by date), only its days, and a note when it starts before the kept days.
export function DailyDriving({ days: all, frame, partial = false }: { days: DayKm[]; frame?: Timeframe; partial?: boolean }) {
  const days = frame ? all.filter((d) => inSpan(d.start, frame.span)) : all;
  // One day of readings has nothing to compare against, so the section waits for a second.
  if (days.filter((d) => d.km !== null).length < 2) return null;
  const total = (frame ? days : days.slice(-30)).reduce((sum, d) => sum + (d.km ?? 0), 0);
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
        <h2 className="text-lg font-medium tracking-heading">Driving per day</h2>
        <p className="text-sm text-muted-foreground tabular-nums">
          {compactNumber.format(total)} km {frame ? frame.words : "in the last 30 days"}
        </p>
        {partial && <p className="text-xs text-faint">Days cover only the last {all.length} days.</p>}
      </div>
      <Bars
        bars={bars}
        ariaLabel="Distance per day"
        labelEvery={7}
        visible={30}
        unit="km"
        caption={`Kilometres driven each day, last ${days.length} days.${days.length > 30 ? " Scroll sideways for days before the latest 30." : ""} Days without an odometer reading are left blank.`}
      />
    </section>
  );
}

const oneDecimal = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

// Drive stats for the last 90 days (or since tracking began), after TeslaMate's: how many drives, how
// long they usually are, the longest, time at the wheel and distance a day. Counted, never projected.
// With `title` (a range picked by date), it names the range instead, and `partial` says the drives reach
// back only DRIVE_DAYS.
export function DriveStatsSection({ stats, title, partial = false }: { stats: DriveStats | null; title?: string; partial?: boolean }) {
  if (!stats) return null;
  const covers = `${Math.max(1, Math.round(stats.days))} ${Math.round(stats.days) === 1 ? "day" : "days"}`;
  const figures = [
    { label: "Distance", value: `${compactNumber.format(Math.round(stats.km))} km` },
    { label: "Trips", value: compactNumber.format(stats.trips), note: `${compactNumber.format(stats.drives)} ${stats.drives === 1 ? "drive" : "drives"}` },
    { label: "Typical drive", value: `${oneDecimal.format(stats.medianKm)} km`, note: "The median" },
    { label: "Longest drive", value: `${oneDecimal.format(stats.longestKm)} km` },
    { label: "Time driving", value: formatDuration(stats.hours * 3600) },
    { label: "Per day", value: `${oneDecimal.format(stats.kmPerDay)} km`, note: "On average" },
  ];
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-medium tracking-heading">Drive stats</h2>
        <p className="text-sm text-muted-foreground">
          {title ? `${title}, ${covers}` : stats.days >= 89 ? "Last 90 days" : `Since tracking began, ${covers}`}.
        </p>
        {partial && <p className="text-xs text-faint">Drives cover only the last {DRIVE_DAYS} days.</p>}
      </div>
      {/* Tiles: easier to take in than a long list. */}
      <Figures figures={figures} />
    </section>
  );
}
