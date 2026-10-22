import { Bars } from "@/components/stats/bars";
import { formatKwh, formatShortDate } from "@/lib/format";
import { inPeriod, monthIndex, monthKey, monthShort, type Period, PERIOD_WORDS, yearOf } from "@/lib/periods";
import type { MonthlyDistance } from "@/lib/server/driving";
import type { MonthlyEnergy } from "@/lib/server/energy";
import { combinedWhPerKm, type DayKm } from "@/lib/telemetry-derive";

// The Driving page's sections: distance per month and per day, and energy use with regen.

const compactNumber = new Intl.NumberFormat("en-IN");
const kwhCompact = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

// Distance and energy use come from 12 monthly counters, so All covers those 12 months.
const DRIVEN_LABELS: Record<Period, string> = { ...PERIOD_WORDS, all: "in the last 12 months" };

// Month bars for the monthly counters: this year's 12 (Year), the 12 the loader has (All), or the last 6.
function monthSlots(period: Period, cur: number): { id: number; label: string }[] {
  const ids =
    period === "year"
      ? Array.from({ length: 12 }, (_, m) => yearOf(cur) * 12 + m)
      : Array.from({ length: period === "all" ? 12 : 6 }, (_, k) => cur - (period === "all" ? 11 : 5) + k);
  return ids.map((id) => ({ id, label: monthShort(id) }));
}

export function Distance({ distance, now, period }: { distance: MonthlyDistance[]; now: number; period: Period }) {
  // A single reading gives no distance yet, so the section stays out of the way.
  if (!distance.some((d) => d.km > 0)) return null;
  const cur = monthIndex(now);
  const km = new Map(distance.map((d) => [d.month, d.km]));
  // The loader has 12 months, so All time shows those 12 and Year shows this calendar year's months.
  const slots = monthSlots(period, cur);
  const total = Array.from({ length: 12 }, (_, k) => cur - 11 + k)
    .filter((index) => inPeriod(period, index, cur))
    .reduce((sum, index) => sum + (km.get(monthKey(index)) ?? 0), 0);
  const bars = slots.map((slot) => {
    const value = km.get(monthKey(slot.id)) ?? 0;
    return { key: String(slot.id), label: slot.label, value, display: compactNumber.format(value), isCurrent: slot.id === cur };
  });
  return (
    <section className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-xs font-medium tracking-wide text-faint uppercase">Distance</h2>
        <p className="font-mono text-4xl font-medium tracking-tight tabular-nums">{compactNumber.format(total)} km</p>
        <p className="text-sm text-muted-foreground">{DRIVEN_LABELS[period]}</p>
      </div>
      <Bars bars={bars} ariaLabel="Distance per month" />
    </section>
  );
}

// Wh/km per month, from the streamed lifetime energy counter and the odometer. It counts everything the
// car drew, parked time included. Months under 50 km are left out.
export function EnergyUse({ energy, now, period }: { energy: MonthlyEnergy[]; now: number; period: Period }) {
  const cur = monthIndex(now);
  const byMonth = new Map(energy.map((e) => [e.month, e.energy]));
  const slots = monthSlots(period, cur);
  const inRange = Array.from({ length: 12 }, (_, k) => cur - 11 + k)
    .filter((index) => inPeriod(period, index, cur))
    .flatMap((index) => byMonth.get(monthKey(index)) ?? []);
  const whPerKm = combinedWhPerKm(inRange);
  if (whPerKm === null) return null;
  const regenTotal = inRange.reduce((sum, m) => sum + (m.regenKwh ?? 0), 0);
  const bars = slots.map((slot) => {
    const value = byMonth.get(monthKey(slot.id))?.whPerKm ?? 0;
    return { key: String(slot.id), label: slot.label, value, display: compactNumber.format(Math.round(value)), isCurrent: slot.id === cur };
  });
  const regenBars = slots.map((slot) => {
    const value = byMonth.get(monthKey(slot.id))?.regenKwh ?? 0;
    return { key: String(slot.id), label: slot.label, value, display: kwhCompact.format(value), isCurrent: slot.id === cur };
  });
  return (
    <section className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-xs font-medium tracking-wide text-faint uppercase">Energy use</h2>
        <p className="font-mono text-4xl font-medium tracking-tight tabular-nums">{compactNumber.format(Math.round(whPerKm))} Wh/km</p>
        <p className="text-sm text-muted-foreground">{DRIVEN_LABELS[period]}</p>
      </div>
      <Bars bars={bars} ariaLabel="Energy use per month in Wh per km" />
      {regenTotal > 0 && (
        <div className="space-y-4">
          <p className="text-sm">
            Regen won back <span className="font-mono font-medium tabular-nums">{formatKwh(regenTotal)}</span>{" "}
            <span className="text-muted-foreground">{DRIVEN_LABELS[period]}</span>
          </p>
          <Bars bars={regenBars} ariaLabel="Energy won back by regen per month in kWh" />
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
