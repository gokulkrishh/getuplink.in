import Link from "next/link";
import { statsHref } from "@/components/stats/periods";
import { energyIn, spendIn } from "@/lib/charging-figures";
import type { Priced } from "@/lib/charging-rates";
import { type Comparison, compareToPrevious } from "@/lib/dashboard-summary";
import type { DrivingFigures } from "@/lib/driving-figures";
import { formatDate, formatShortDate } from "@/lib/format";
import { type Period, periodSpan, previousLabel, previousSpan } from "@/lib/periods";
import type { ChargingSession } from "@/lib/server/charging";
import type { StreamChargeSession } from "@/lib/server/stream-charging";
import { cn } from "@/lib/utils";

const number = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

function Card({ href, label, value, unit, note, footnote }: { href: string; label: string; value: string; unit?: string; note: Comparison | null; footnote?: string | null }) {
  return (
    <Link
      href={href}
      prefetch={true}
      className="group block space-y-1 border p-4 transition-colors duration-150 hover:border-muted-foreground/50"
    >
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
    </Link>
  );
}

// The period's four numbers, each against the same span before (see previousSpan). Driving comes from the
// primary car's counters; charging is every session, priced like the Charging page. A comparison needs
// tracking to have begun before that span, or it would compare against part of one; until then the card
// says since when. All has nothing to compare with.
export function Headline({
  period,
  now,
  figures,
  sessions,
  streamOnly,
  priced,
}: {
  period: Period;
  now: number;
  figures: DrivingFigures;
  // Tesla's sessions, and the streamed ones Tesla didn't bill (see matchSessions).
  sessions: ChargingSession[];
  streamOnly: StreamChargeSession[];
  priced: Priced[];
}) {
  const span = periodSpan(period, now);
  const before = previousSpan(period, now);
  const label = previousLabel(period, now) ?? "";
  const { since } = figures;
  const comparable = before !== null && since !== null && since <= before.from;
  // "18 Oct" this year, "30 Dec 2025" before it.
  const sinceText = since === null ? null : formatDate(since).slice(-4) === formatDate(now).slice(-4) ? formatShortDate(since) : formatDate(since);
  const tracking: Comparison | null = period !== "all" && sinceText ? { text: `Tracking since ${sinceText}`, tone: "neutral" } : null;
  const { current, previous } = figures.periods[period];

  const spend = spendIn(sessions, priced, span);
  const spendBefore = comparable ? spendIn(sessions, priced, before).cost : null;
  const energy = energyIn(sessions, streamOnly, span);
  const energyBefore = comparable ? energyIn(sessions, streamOnly, before) : null;
  const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: spend.currency, maximumFractionDigits: 0 });
  const compare = (value: number | null, earlier: number | null, unit: string | ((n: number) => string), lowerIsBetter = false) =>
    value === null ? null : (compareToPrevious(value, earlier, unit, label, { lowerIsBetter }) ?? tracking);

  return (
    <div className="grid grid-cols-2 gap-3">
      <Card
        href={statsHref("driving", period)}
        label="Driven"
        value={current.km === null ? "—" : number.format(current.km)}
        unit="km"
        note={compare(current.km, previous?.km ?? null, "km")}
      />
      <Card
        href={statsHref("charging", period)}
        label="Spent"
        value={money.format(spend.cost)}
        note={compare(spend.cost, spendBefore, (n) => money.format(n))}
        footnote={spend.atYourRates > 0 ? `Includes ${money.format(spend.atYourRates)} at your rates` : null}
      />
      <Card
        href={statsHref("charging", period)}
        label="Energy added"
        value={number.format(energy)}
        unit="kWh"
        note={compare(energy, energyBefore, "kWh")}
      />
      <Card
        href={statsHref("driving", period)}
        label="Efficiency"
        value={current.whPerKm === null ? "—" : number.format(current.whPerKm)}
        unit="Wh/km"
        note={compare(current.whPerKm, previous?.whPerKm ?? null, "Wh/km", true)}
      />
    </div>
  );
}
