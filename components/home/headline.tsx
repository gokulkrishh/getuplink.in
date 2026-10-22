import { PeriodLink } from "@/components/home/more-link";
import type { View } from "@/components/stats/periods";
import { energyIn, spendIn } from "@/lib/charging-figures";
import type { Priced } from "@/lib/charging-rates";
import { type Comparison, compareToPrevious } from "@/lib/dashboard-summary";
import type { DrivingFigures } from "@/lib/driving-figures";
import { formatDate, formatShortDate } from "@/lib/format";
import { type Period, periodSpan, previousLabel, previousSpan, trackingGap } from "@/lib/periods";
import type { ChargingSession } from "@/lib/server/charging";
import type { StreamChargeSession } from "@/lib/server/stream-charging";
import { cn } from "@/lib/utils";

const number = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

function Card({ view, label, value, unit, note, footnote }: { view: View; label: string; value: string; unit?: string; note: Comparison | null; footnote?: string | null }) {
  return (
    <PeriodLink view={view} className="group block space-y-1 border p-4 transition-colors duration-150 hover:border-muted-foreground/50">
      <p className="text-xs text-faint transition-colors duration-150 group-hover:text-foreground">{label}</p>
      <p className="font-mono text-2xl font-medium tracking-tight tabular-nums">
        {value}
        {unit && <span className="ml-1 text-xs font-normal text-faint">{unit}</span>}
      </p>
      {note && (
        <p
          className={cn(
            "text-xs",
            note.tone === "better" ? "text-chart-better" : note.tone === "worse" ? "text-chart-worse" : "text-muted-foreground",
          )}
        >
          {note.text}
        </p>
      )}
      {footnote && <p className="text-xs text-faint tabular-nums">{footnote}</p>}
    </PeriodLink>
  );
}

// The period's four numbers, each against the same span before (see previousSpan). Driving comes from the
// primary car's counters; charging is every session, priced like the Charging page. A comparison needs
// tracking to have begun before that span, or it would compare against part of one: driving tracking
// begins at the first odometer reading, charging at the first session. A card without a comparison shows
// none, and one line under the cards says since when (see trackingGap). All has nothing to compare with.
// Every period is laid out on home at once (ByPeriod's steady), so the cards keep one height on a switch.
export function Headline({
  period,
  now,
  figures,
  sessions,
  streamOnly,
  priced,
  chargingSince,
}: {
  period: Period;
  now: number;
  figures: DrivingFigures;
  // Tesla's sessions, and the streamed ones Tesla didn't bill (see matchSessions).
  sessions: ChargingSession[];
  streamOnly: StreamChargeSession[];
  priced: Priced[];
  // The first charging session, billed or streamed (see firstStartedAt).
  chargingSince: number | null;
}) {
  const span = periodSpan(period, now);
  const before = previousSpan(period, now);
  const label = previousLabel(period, now) ?? "";
  // The driving counters already leave out a span they don't cover (see drivingFigures); charging is checked here.
  const chargingTracked = before !== null && chargingSince !== null && chargingSince <= before.from;
  const gap = trackingGap(before, [figures.since, chargingSince]);
  // "18 Oct" this year, "30 Dec 2025" before it.
  const gapText = gap === null ? null : formatDate(gap).slice(-4) === formatDate(now).slice(-4) ? formatShortDate(gap) : formatDate(gap);
  const { current, previous } = figures.periods[period];

  const spend = spendIn(sessions, priced, span);
  const spendBefore = before && chargingTracked ? spendIn(sessions, priced, before).cost : null;
  const energy = energyIn(sessions, streamOnly, span);
  const energyBefore = before && chargingTracked ? energyIn(sessions, streamOnly, before) : null;
  const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: spend.currency, maximumFractionDigits: 0 });
  const compare = (value: number | null, earlier: number | null, unit: string | ((n: number) => string), lowerIsBetter = false) =>
    value === null ? null : compareToPrevious(value, earlier, unit, label, { lowerIsBetter });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Card
          view="driving"
          label="Driven"
          value={current.km === null ? "—" : number.format(current.km)}
          unit="km"
          note={compare(current.km, previous?.km ?? null, "km")}
        />
        <Card
          view="charging"
          label="Spent"
          value={money.format(spend.cost)}
          note={compare(spend.cost, spendBefore, (n) => money.format(n))}
          footnote={spend.atYourRates > 0 ? `Includes ${money.format(spend.atYourRates)} at your rates` : null}
        />
        <Card
          view="charging"
          label="Energy added"
          value={number.format(energy)}
          unit="kWh"
          note={compare(energy, energyBefore, "kWh")}
        />
        <Card
          view="driving"
          label="Efficiency"
          value={current.whPerKm === null ? "—" : number.format(current.whPerKm)}
          unit="Wh/km"
          note={compare(current.whPerKm, previous?.whPerKm ?? null, "Wh/km", true)}
        />
      </div>
      {gapText && <p className="text-xs text-muted-foreground">Tracking since {gapText} · no earlier period to compare</p>}
    </div>
  );
}
