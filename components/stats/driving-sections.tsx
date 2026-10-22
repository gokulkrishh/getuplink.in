import { Bars } from "@/components/stats/bars";
import { formatKwh, formatShortDate } from "@/lib/format";
import type { DrivingFigures } from "@/lib/driving-figures";
import { type Period, PERIOD_WORDS, SLOT_NAMES, slotsFor } from "@/lib/periods";
import type { DayKm } from "@/lib/telemetry-derive";

// The Driving page's sections: distance per month and per day, and energy use with regen.

const compactNumber = new Intl.NumberFormat("en-IN");
const kwhCompact = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

// Distance for the period, with a bar per day (Week), month or year.
export function Distance({ figures, now, period }: { figures: DrivingFigures; now: number; period: Period }) {
  const { current, bars: values } = figures.periods[period];
  // A single reading gives no distance yet, so the section stays out of the way.
  if (!values.some((v) => (v.km ?? 0) > 0) && !current.km) return null;
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
      <Bars bars={bars} ariaLabel={`Distance per ${SLOT_NAMES[period]}`} />
    </section>
  );
}

// Wh/km for the period and each bar, from the streamed lifetime energy counter and the odometer. It counts
// everything the car drew, parked time included, so short spans are left out (see drivingFigures).
export function EnergyUse({ figures, now, period }: { figures: DrivingFigures; now: number; period: Period }) {
  const { current, bars: values } = figures.periods[period];
  if (current.whPerKm === null) return null;
  const slots = slotsFor(period, now);
  const bars = slots.map((slot, k) => {
    const value = values[k].whPerKm ?? 0;
    return { key: String(slot.id), label: slot.label, value, display: compactNumber.format(Math.round(value)), isCurrent: slot.isCurrent };
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
        <p className="font-mono text-4xl font-medium tracking-tight tabular-nums">{compactNumber.format(Math.round(current.whPerKm))} Wh/km</p>
        <p className="text-sm text-muted-foreground">{PERIOD_WORDS[period]}</p>
      </div>
      <Bars bars={bars} ariaLabel={`Energy use per ${SLOT_NAMES[period]} in Wh per km`} />
      {regenTotal > 0 && (
        <div className="space-y-4">
          <p className="text-sm">
            Regen won back <span className="font-mono font-medium tabular-nums">{formatKwh(regenTotal)}</span>{" "}
            <span className="text-muted-foreground">{PERIOD_WORDS[period]}</span>
          </p>
          <Bars bars={regenBars} ariaLabel={`Energy won back by regen per ${SLOT_NAMES[period]} in kWh`} />
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
    display: `${compactNumber.format(d.km ?? 0)} km`,
    isCurrent: k === days.length - 1,
    blank: d.km === null,
  }));
  return (
    <section className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-xs font-medium tracking-wide text-faint uppercase">Driving per day</h2>
        <p className="text-sm text-muted-foreground tabular-nums">{compactNumber.format(total)} km in the last 30 days</p>
      </div>
      <Bars bars={bars} ariaLabel="Distance per day" labelEvery={7} visible={30} />
    </section>
  );
}
