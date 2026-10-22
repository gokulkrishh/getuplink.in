import { type Listed, rate, SessionRow } from "@/components/session-row";
import { ShowMore } from "@/components/show-more";
import { Bars } from "@/components/stats/bars";
import { StackedBars, type StackedBar } from "@/components/stats/stacked-bars";
import { chargeEfficiency } from "@/lib/charge-sessions";
import { spendBySlot } from "@/lib/charging-figures";
import { formatKwh, formatMoney, formatMonth } from "@/lib/format";
import { LIST_PREVIEW } from "@/lib/list";
import { inSpan, type Period, PERIOD_WORDS, periodSpan, SLOT_NAMES, slotsFor } from "@/lib/periods";
import type { ChargingSession } from "@/lib/server/charging";
import type { StreamChargeSession } from "@/lib/server/stream-charging";

// The Charging page's sections: spend, energy added by charger kind, and every session by month.

function totals(rows: ChargingSession[]) {
  return {
    cost: rows.reduce((sum, s) => sum + (s.cost_total ?? 0), 0),
    energy: rows.reduce((sum, s) => sum + (s.energy_kwh ?? 0), 0),
    count: rows.length,
    currency: rows.find((s) => s.currency)?.currency ?? "INR",
  };
}

// Spend is Tesla's billed Supercharger amount, with the energy and sessions it covers.
export function Summary({ sessions, now, period }: { sessions: ChargingSession[]; now: number; period: Period }) {
  const span = periodSpan(period, now);
  const { cost, energy, count, currency } = totals(sessions.filter((s) => inSpan(Date.parse(s.started_at), span)));
  const rateText = rate(cost, energy, currency);
  const slots = slotsFor(period, now);
  const spend = spendBySlot(sessions, slots);
  const compact = new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 });
  const bars = slots.map((slot, k) => ({ key: String(slot.id), label: slot.label, value: spend[k], display: compact.format(spend[k]), isCurrent: slot.isCurrent }));
  return (
    <section className="space-y-8">
      <div className="space-y-2">
        <p className="text-xs tracking-wide text-faint uppercase">Spent {PERIOD_WORDS[period]}</p>
        <p className="font-mono text-4xl font-medium tracking-tight tabular-nums">{formatMoney(cost, currency)}</p>
        <p className="text-sm text-muted-foreground tabular-nums">
          {[formatKwh(energy), `${count} ${count === 1 ? "session" : "sessions"}`, rateText && `${rateText} avg`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <Bars bars={bars} ariaLabel={`Spend per ${SLOT_NAMES[period]}`} prefix="₹" />
    </section>
  );
}

const kwhCompact = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

// Tones from the foreground down, so the series read apart without colour.
const ENERGY_SERIES = [
  { label: "Supercharger", className: "bg-chart-1" },
  { label: "Third-party DC", className: "bg-chart-2" },
  { label: "AC", className: "bg-chart-3" },
];

// Energy added per month (per year for All time), split by charger kind. Supercharger energy is
// Tesla's billed figure; the other two come from the car's own readings.
export function EnergyAdded({
  sessions,
  streamOnly,
  now,
  period,
}: {
  sessions: ChargingSession[];
  streamOnly: StreamChargeSession[];
  now: number;
  period: Period;
}) {
  const span = periodSpan(period, now);
  const slots = slotsFor(period, now);
  // Supercharger, third-party DC and AC energy per slot.
  const energy = slots.map(() => [0, 0, 0]);
  let total = 0;
  const add = (startedAt: string, series: number, kwh: number | null) => {
    if (!kwh || kwh <= 0) return;
    const at = Date.parse(startedAt);
    const k = slots.findIndex((slot) => inSpan(at, slot));
    if (k >= 0) energy[k][series] += kwh;
    if (inSpan(at, span)) total += kwh;
  };
  for (const s of sessions) add(s.started_at, 0, s.energy_kwh);
  for (const s of streamOnly) add(s.started_at, s.supercharger ? 0 : s.kind === "dc" ? 1 : 2, s.energy_added_kwh);
  const bars: StackedBar[] = slots.map((slot, k) => {
    const sum = energy[k].reduce((a, b) => a + b, 0);
    return { key: String(slot.id), label: slot.label, total: sum, display: kwhCompact.format(sum), isCurrent: slot.isCurrent, segments: energy[k] };
  });
  const efficiency = chargeEfficiency(streamOnly.filter((s) => s.kind === "ac" && inSpan(Date.parse(s.started_at), span)));
  return (
    <section className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-xs font-medium tracking-wide text-faint uppercase">Energy added</h2>
        <p className="font-mono text-4xl font-medium tracking-tight tabular-nums">{formatKwh(total)}</p>
        <p className="text-sm text-muted-foreground">{PERIOD_WORDS[period]}</p>
      </div>
      <StackedBars bars={bars} series={ENERGY_SERIES} ariaLabel={`Energy added per ${SLOT_NAMES[period]}`} />
      {efficiency !== null && (
        <div className="space-y-1">
          <p className="text-sm">
            AC charging efficiency <span className="font-mono font-medium tabular-nums">{Math.round(efficiency * 100)}%</span>
          </p>
          <p className="text-xs text-muted-foreground">
            How much of the energy from the charger ended up in the battery, estimated from the car&apos;s own readings.
          </p>
        </div>
      )}
    </section>
  );
}

export function SessionList({ sessions }: { sessions: Listed[] }) {
  // Sessions arrive newest first, so each month's group is in order too. Numbers count from the first
  // charge, so the newest has the highest.
  const serial = new Map(sessions.map((s, i) => [s.key, sessions.length - i]));
  const energyTotal = sessions.reduce((sum, s) => sum + ((s.tesla ? s.tesla.energy_kwh : s.stream?.energy_added_kwh) ?? 0), 0);
  const groups = new Map<string, Listed[]>();
  for (const s of sessions) {
    const month = formatMonth(s.started_at);
    groups.set(month, [...(groups.get(month) ?? []), s]);
  }
  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-4 text-xs tracking-wide text-faint uppercase">
          <h2 className="font-medium">Charging sessions</h2>
          <p className="tabular-nums">
            {sessions.length} {sessions.length === 1 ? "session" : "sessions"}
            {energyTotal > 0 && ` · ${formatKwh(energyTotal)}`}
          </p>
        </div>
      </div>
    {/* On phones the list keeps its columns and scrolls sideways. */}
    <div className="max-sm:-mx-1 max-sm:overflow-x-auto max-sm:overflow-y-hidden max-sm:px-1">
    <div className="max-sm:min-w-xl space-y-10">
      {[...groups].map(([month, rows]) => {
        const billed = totals(rows.flatMap((r) => (r.tesla ? [r.tesla] : [])));
        return (
          <section key={month} className="space-y-2">
            <h3 className="text-xs font-medium tracking-wide text-faint uppercase">{month}</h3>
            <div>
              <ul className="divide-y border-t">
                {rows.slice(0, LIST_PREVIEW).map((s) => (
                  <SessionRow key={s.key} item={s} serial={serial.get(s.key) ?? 0} />
                ))}
              </ul>
              {rows.length > LIST_PREVIEW && (
                <ShowMore count={rows.length - LIST_PREVIEW}>
                  <ul className="divide-y border-t">
                    {rows.slice(LIST_PREVIEW).map((s) => (
                      <SessionRow key={s.key} item={s} serial={serial.get(s.key) ?? 0} />
                    ))}
                  </ul>
                </ShowMore>
              )}
            </div>
            <p className="pt-1 text-right text-xs text-faint tabular-nums">
              {rows.length} {rows.length === 1 ? "session" : "sessions"}
              {billed.count > 0 && `, ${formatMoney(billed.cost, billed.currency)} at Superchargers`}            </p>
          </section>
        );
      })}
    </div>
    </div>
    </section>
  );
}
