import { ScrollX } from "@/components/scroll-x";
import type { TipRow } from "@/components/stats/bar-parts";
import { hasCosts, type Listed, SessionHeader, SessionRow } from "@/components/session-row";
import { ShowMore } from "@/components/show-more";
import { ChartCard } from "@/components/chart-card";
import { Bars } from "@/components/stats/bars";
import { Figures } from "@/components/stats/figures";
import { StackedBars, type StackedBar } from "@/components/stats/stacked-bars";
import { chargeEfficiency } from "@/lib/charge-sessions";
import { type Bill, billsBySlot, billsIn, energyIn, spendBreakdown } from "@/lib/charging-figures";
import { comparedWith, headline } from "@/lib/dashboard-summary";
import { DECIMALS, formatDuration, formatKm, formatKwh, formatMoney, formatMonth, formatNumber, formatPercent, showsZero, sumKnown } from "@/lib/format";
import { hasBars, Headline, knownBars } from "@/components/stats/driving-sections";
import { LIST_PREVIEW } from "@/lib/list";
import { serials } from "@/lib/kept";
import { inSpan, type Slot, type Span, type Timeframe } from "@/lib/periods";
import { barsSpan } from "@/components/stats/chart-caption";
import type { ChargingSession } from "@/lib/server/charging";
import type { StreamChargeSession } from "@/lib/server/stream-charging";
import { Measure } from "@/components/measure";

// The Charging page's sections: spend, energy added by charger kind, and every session by month.

// What a month of the session list was billed: Tesla's bills and the invoices attached, as in Summary.
function totals(rows: Listed[]) {
  const costs = rows.flatMap((r) => (r.tesla ? (r.tesla.cost_total === null ? [] : [r.tesla.cost_total]) : r.invoice ? [r.invoice.amount] : []));
  return {
    cost: costs.reduce((sum, n) => sum + n, 0),
    count: costs.length,
    currency: rows.find((r) => r.tesla?.currency)?.tesla?.currency ?? "INR",
  };
}

// The span a charging figure is compared with, when charging tracking (the first session, billed or
// streamed) began before it: later, the figure there would be part of one. Null otherwise, as on home.
export function trackedBefore(frame: Pick<Timeframe, "previous">, chargingSince: number | null): Span | null {
  const before = frame.previous;
  return before !== null && chargingSince !== null && chargingSince <= before.from ? before : null;
}

// Spend from real bills only: Tesla's for Superchargers, attached invoices for other chargers, against the
// span before where tracking covers it (`chargingSince`, see trackedBefore). Then ₹/kWh by charger kind
// and time on the charger (`charged`, ms by kind, see chargingTime) in one row of tiles with ₹ per 100 km
// driven in the same period, and how many charges had no bill, so a cheap-looking month isn't mistaken
// for one.
export function Summary({
  bills,
  unbilled,
  charged,
  km,
  frame,
  chargingSince,
}: {
  bills: Bill[];
  unbilled: { started_at: string }[];
  charged: { ac: number; dc: number };
  km: number | null;
  frame: Timeframe;
  chargingSince: number | null;
}) {
  const { span, slots } = frame;
  const { kwh, count, acPerKwh, dcPerKwh } = billsIn(bills, span);
  const before = trackedBefore(frame, chargingSince);
  const money = (n: number) => formatMoney(n, "INR");
  const missing = unbilled.filter((s) => inSpan(Date.parse(s.started_at), span)).length;
  // A bar ahead of now (the rest of this year or of today) is blank, not ₹0. To the paisa, rounded with
  // the headline (see knownBars), so the bars add up to it as shown.
  const { bars: plain, total: cost } = knownBars(slots, billsBySlot(bills, slots), DECIMALS.money, (n) => formatMoney(n, "INR"));
  // Each bar's tip adds what the chart can't show: how many bills, the energy they billed and the rates.
  const detail = (slot: Slot): TipRow[] => {
    const inSlot = billsIn(bills, slot);
    if (inSlot.count === 0) return [];
    return [
      { label: "Bills", value: String(inSlot.count) },
      ...(inSlot.kwh > 0 ? [{ label: "Energy", value: formatKwh(inSlot.kwh) }] : []),
      ...(inSlot.acPerKwh !== null ? [{ label: "AC rate", value: `${formatMoney(inSlot.acPerKwh, "INR")}/kWh` }] : []),
      ...(inSlot.dcPerKwh !== null ? [{ label: "DC rate", value: `${formatMoney(inSlot.dcPerKwh, "INR")}/kWh` }] : []),
    ];
  };
  const bars = plain.map((b, k) => ({ ...b, tip: detail(slots[k]) }));
  const ac = acPerKwh !== null || charged.ac > 0;
  const dc = dcPerKwh !== null || charged.dc > 0;
  const perKm = km !== null && km >= 10 && cost > 0 && missing === 0 ? (cost / km) * 100 : null;
  // "Spent on charging this month, ₹310 less than 1 to 26 Sept": less or more, as money reads plainest.
  const compared = comparedWith(cost, before && billsIn(bills, before).cost, money, frame.previousLabel, { decimals: DECIMALS.money });
  return (
    <section className="space-y-8">
      <ChartCard
        title="Spend"
        // With no bills, the empty line says so alone; a ₹0.00 headline over it would say it twice.
        summary={hasBars(bars) ? <Headline value={money(cost)}>{headline("Spent on charging", compared)}</Headline> : undefined}
        caption={barsSpan(frame)}
        empty={hasBars(bars) ? undefined : "No bills."}
      >
        <Bars bars={bars} valueLabel="Spent" ariaLabel={`Spend per ${frame.slotName}`} prefix="₹" labelEvery={frame.labelEvery} fit view="charging" />
      </ChartCard>
      {/* What only some periods have (the rates, these lines) goes under the chart, so it stays put on a switch.
          With no bill and no time on a charger, the empty line above says it all. */}
      {(count > 0 || ac || dc) && (
        <Figures
          figures={[
            // What a kilometre cost: the period's bills over the distance driven in it, only when every
            // charge has a bill (else it reads cheaper than it was) and there's driving enough to divide by.
            perKm !== null && { label: "Cost per 100 km", value: formatMoney(perKm, "INR"), note: `${formatKm(km!)} driven` },
            { label: "Energy billed", value: formatKwh(kwh) },
            { label: "Bills", value: count },
            acPerKwh !== null && { label: "AC rate", value: `${formatMoney(acPerKwh, "INR")}/kWh`, note: "Slower charging" },
            dcPerKwh !== null && { label: "DC rate", value: `${formatMoney(dcPerKwh, "INR")}/kWh`, note: "Fast charging" },
            charged.ac > 0 && { label: "Time on AC", value: formatDuration(charged.ac / 1000) },
            charged.dc > 0 && { label: "Time on DC", value: formatDuration(charged.dc / 1000) },
          ]}
          label="bills"
        />
      )}
      {missing > 0 && (
        <p className="text-sm text-faint">
          {missing} {missing === 1 ? "charge has" : "charges have"} no bill yet, so {missing === 1 ? "it isn't" : "they aren't"} counted.
        </p>
      )}
    </section>
  );
}

// What the period's bills were for, as lines adding up to Spend's total: Tesla's fee lines for
// Superchargers, the invoices' energy, fees and GST for other chargers, and any bill that doesn't split
// its amount. Nothing when no bill in the period is itemised. Its own section, not under Spend's tiles,
// so periods without it don't hold Spend open to its height.
export function PaidFor({ bills, frame }: { bills: Bill[]; frame: Timeframe }) {
  const breakdown = spendBreakdown(bills, frame.span);
  if (!breakdown) return null;
  const { supercharger, invoice, unitemised, total } = breakdown;
  const both = supercharger.length > 0 && invoice.length > 0;
  const row = (label: string, amount: number, strong = false) => (
    <div key={label} className={`flex items-baseline justify-between gap-4 py-2.5 ${strong ? "font-medium" : ""}`}>
      <dt className={strong ? "" : "text-muted-foreground"}>{label}</dt>
      <dd className="font-mono tabular-nums">
        <Measure text={formatMoney(amount, "INR")} />
      </dd>
    </div>
  );
  const group = (title: string, lines: { label: string; amount: number }[]) =>
    lines.length > 0 && (
      <div key={title}>
        {both && <p className="pt-3 pb-1 text-xs text-faint">{title}</p>}
        <dl>{lines.map((l) => row(l.label, l.amount))}</dl>
      </div>
    );
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-lg font-medium tracking-heading">What you paid for</h2>
        <p className="text-sm text-muted-foreground">Your spend, line by line from the bills.</p>
      </div>
      <div className="divide-y border-t border-b text-sm">
        {group("Superchargers", supercharger)}
        {group("Other chargers", invoice)}
        {unitemised > 0 && <dl>{row("Not itemised", unitemised)}</dl>}
        <dl>{row("Total", total, true)}</dl>
      </div>
    </section>
  );
}

// Tones from the foreground down, so the series read apart without colour.
// Charging's green, darker the faster the charger: Supercharger, then third-party DC, then AC.
const ENERGY_SERIES = [
  { label: "Supercharger", className: "bg-charge" },
  { label: "Third-party DC", className: "bg-charge/65" },
  { label: "AC", className: "bg-charge/35" },
];

// Energy added per bar of the period or range (see Timeframe), split by charger kind, against the span
// before where tracking covers it (see trackedBefore). Supercharger energy is Tesla's billed figure; the
// other two come from the car's own readings.
export function EnergyAdded({
  sessions,
  streamOnly,
  frame,
  chargingSince,
}: {
  sessions: ChargingSession[];
  streamOnly: StreamChargeSession[];
  frame: Timeframe;
  chargingSince: number | null;
}) {
  const { span, slots } = frame;
  const before = trackedBefore(frame, chargingSince);
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
  // The headline is the columns' raw sum, and each column its chargers' raw sum; every figure is rounded
  // on its own when shown.
  total = sumKnown(energy.map((e, k) => (slots[k].ahead ? null : sumKnown(e))));
  const bars: StackedBar[] = slots.map((slot, k) => {
    const sum = sumKnown(energy[k]);
    return { key: String(slot.id), label: slot.label, axis: slot.axis, edge: slot.edge, days: slot.days, total: sum, display: formatNumber(sum, DECIMALS.kWh), isCurrent: slot.isCurrent, segments: energy[k], blank: slot.ahead || undefined };
  });
  const efficiency = chargeEfficiency(streamOnly.filter((s) => s.kind === "ac" && inSpan(Date.parse(s.started_at), span)));
  // Any column that shows above 0.0 kWh; without one, the empty line stands alone, as on Spend.
  const charged = bars.some((b) => b.total > 0 && !showsZero(b.display));
  const compared = comparedWith(total, before && energyIn(sessions, streamOnly, before), "kWh", frame.previousLabel, { decimals: DECIMALS.kWh });
  return (
    <section className="space-y-8">
      <ChartCard
        title="Energy added"
        description="Energy into the battery, by charger type."
        summary={charged ? <Headline value={formatKwh(total)}>{headline("Added", compared)}</Headline> : undefined}
        caption={barsSpan(frame)}
        empty={charged ? undefined : "No charging."}
      >
        <StackedBars bars={bars} series={ENERGY_SERIES} ariaLabel={`Energy added per ${frame.slotName}`} labelEvery={frame.labelEvery} fit view="charging" />
      </ChartCard>
      {efficiency !== null && (
        <p className="flex items-center gap-1.5 text-sm">
          AC charging efficiency <span className="font-mono font-medium tabular-nums"><Measure text={formatPercent(efficiency * 100)} /></span>
        </p>
      )}
    </section>
  );
}

export function SessionList({ sessions }: { sessions: Listed[] }) {
  // Sessions arrive newest first, so each month's group is in order too. Numbered from the top row, 1.
  const serial = serials(sessions, (s) => s.key);
  // The total is the rows' raw energy added up, rounded once when shown, like each row.
  const energyTotal = sumKnown(sessions.map((s) => (s.tesla ? s.tesla.energy_kwh : s.stream?.energy_added_kwh)));
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
    <ScrollX className="max-sm:-mx-1 max-sm:px-1 sm:-mx-3 sm:px-3">
    <div className="max-sm:min-w-xl space-y-10">
      {[...groups].map(([month, rows]) => {
        const billed = totals(rows);
        return (
          <section key={month} className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">{month}</h3>
            <div>
              <SessionHeader costs={costs} numbered />
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
              {rows.length} {rows.length === 1 ? "charge" : "charges"}
              {billed.count > 0 && `, ${formatMoney(billed.cost, billed.currency)} billed`}
            </p>
          </section>
        );
      })}
    </div>
    </ScrollX>
    </section>
  );
}
