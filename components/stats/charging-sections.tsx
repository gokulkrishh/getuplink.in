import { hasCosts, hasStationNames, type Listed, OsmCredit, SessionHeader, SessionRow } from "@/components/session-row";
import { ShowMore } from "@/components/show-more";
import { Bars } from "@/components/stats/bars";
import { Figures } from "@/components/stats/figures";
import { StackedBars, type StackedBar } from "@/components/stats/stacked-bars";
import { chargeEfficiency } from "@/lib/charge-sessions";
import { type Bill, billsBySlot, billsIn } from "@/lib/charging-figures";
import { formatDuration, formatKwh, formatMoney, formatMonth } from "@/lib/format";
import { LIST_PREVIEW } from "@/lib/list";
import { inSpan, type Timeframe } from "@/lib/periods";
import type { ChargingSession } from "@/lib/server/charging";
import type { StreamChargeSession } from "@/lib/server/stream-charging";

// The Charging page's sections: spend, energy added by charger kind, and every session by month.

// Tesla's billed total for a month of the session list.
function totals(rows: ChargingSession[]) {
  return {
    cost: rows.reduce((sum, s) => sum + (s.cost_total ?? 0), 0),
    energy: rows.reduce((sum, s) => sum + (s.energy_kwh ?? 0), 0),
    count: rows.length,
    currency: rows.find((s) => s.currency)?.currency ?? "INR",
  };
}

// Spend from real bills only: Tesla's for Superchargers, attached invoices for other chargers. Then
// ₹/kWh by charger kind, ₹ per 100 km driven in the same period, and how many charges had no bill, so a
// cheap-looking month isn't mistaken for one.
export function Summary({
  bills,
  unbilled,
  km,
  frame,
}: {
  bills: Bill[];
  unbilled: { started_at: string }[];
  km: number | null;
  frame: Timeframe;
}) {
  const { span, slots } = frame;
  const { cost, kwh, count, acPerKwh, dcPerKwh } = billsIn(bills, span);
  const missing = unbilled.filter((s) => inSpan(Date.parse(s.started_at), span)).length;
  const spend = billsBySlot(bills, slots);
  const compact = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
  const bars = slots.map((slot, k) => ({ key: String(slot.id), label: slot.label, value: spend[k], display: compact.format(spend[k]), isCurrent: slot.isCurrent }));
  return (
    <section className="space-y-8">
      <div className="space-y-2">
        <p className="text-xs tracking-wide text-faint uppercase">Spent {frame.words}</p>
        <p className="font-mono text-4xl font-medium tracking-tight tabular-nums">{formatMoney(cost, "INR")}</p>
        <Figures
          figures={[
            { label: "Energy billed", value: formatKwh(kwh) },
            { label: "Bills", value: count },
            acPerKwh !== null && { label: "AC rate", value: `${formatMoney(acPerKwh, "INR")}/kWh` },
            dcPerKwh !== null && { label: "DC rate", value: `${formatMoney(dcPerKwh, "INR")}/kWh` },
          ]}
        />
        {km !== null && km >= 10 && cost > 0 && missing === 0 && (
          <p className="text-sm text-muted-foreground tabular-nums">{formatMoney((cost / km) * 100, "INR")} per 100 km driven</p>
        )}
        {missing > 0 && (
          <p className="text-xs text-faint">
            {missing} {missing === 1 ? "charge has" : "charges have"} no bill yet (home charging, or no invoice attached), so {missing === 1 ? "it isn't" : "they aren't"} counted.
          </p>
        )}
      </div>
      <Bars bars={bars} ariaLabel={`Spend per ${frame.slotName}`} prefix="₹" labelEvery={frame.labelEvery} empty={`No bills ${frame.words}`} />
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

// Energy added per bar of the period or range (see Timeframe), split by charger kind. Supercharger energy is
// Tesla's billed figure; the other two come from the car's own readings.
export function EnergyAdded({
  sessions,
  streamOnly,
  frame,
}: {
  sessions: ChargingSession[];
  streamOnly: StreamChargeSession[];
  frame: Timeframe;
}) {
  const { span, slots } = frame;
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
  // Time on the charger by kind, after TeslaMate's AC/DC duration: Superchargers from Tesla's times, the
  // rest from the car's own sessions.
  const charged = { ac: 0, dc: 0 };
  for (const s of sessions) {
    if (s.stopped_at && inSpan(Date.parse(s.started_at), span)) charged.dc += Date.parse(s.stopped_at) - Date.parse(s.started_at);
  }
  for (const s of streamOnly) {
    if (s.ended_at && inSpan(Date.parse(s.started_at), span)) charged[s.kind] += Date.parse(s.ended_at) - Date.parse(s.started_at);
  }
  return (
    <section className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-lg font-medium tracking-heading">Energy added</h2>
        <p className="font-mono text-4xl font-medium tracking-tight tabular-nums">{formatKwh(total)}</p>
        <p className="text-sm text-muted-foreground">{frame.words}</p>
      </div>
      <StackedBars
        bars={bars}
        series={ENERGY_SERIES}
        ariaLabel={`Energy added per ${frame.slotName}`}
        labelEvery={frame.labelEvery}
        empty={`No charging ${frame.words}`}
      />
      {charged.ac + charged.dc > 0 && (
        <Figures
          figures={[
            charged.ac > 0 && { label: "Time on AC", value: formatDuration(charged.ac / 1000) },
            charged.dc > 0 && { label: "Time on DC", value: formatDuration(charged.dc / 1000) },
          ]}
        />
      )}
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

// `all` is every session, when `sessions` is only some of them (a range picked by date), so each keeps
// its number.
export function SessionList({ sessions, all = sessions }: { sessions: Listed[]; all?: Listed[] }) {
  // Sessions arrive newest first, so each month's group is in order too. Numbers count from the first
  // charge, so the newest has the highest.
  const serial = new Map(all.map((s, i) => [s.key, all.length - i]));
  const energyTotal = sessions.reduce((sum, s) => sum + ((s.tesla ? s.tesla.energy_kwh : s.stream?.energy_added_kwh) ?? 0), 0);
  const costs = hasCosts(sessions);
  const groups = new Map<string, Listed[]>();
  for (const s of sessions) {
    const month = formatMonth(s.started_at);
    groups.set(month, [...(groups.get(month) ?? []), s]);
  }
  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-medium tracking-heading">Charging sessions</h2>
          <p className="text-sm text-muted-foreground tabular-nums">
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
              <SessionHeader costs={costs} />
              <ul className="divide-y border-t">
                {rows.slice(0, LIST_PREVIEW).map((s) => (
                  <SessionRow key={s.key} item={s} serial={serial.get(s.key) ?? 0} costs={costs} />
                ))}
              </ul>
              {rows.length > LIST_PREVIEW && (
                <ShowMore count={rows.length - LIST_PREVIEW}>
                  <ul className="divide-y border-t">
                    {rows.slice(LIST_PREVIEW).map((s) => (
                      <SessionRow key={s.key} item={s} serial={serial.get(s.key) ?? 0} costs={costs} />
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
    {hasStationNames(sessions) && <OsmCredit />}
    </section>
  );
}
