import type { ReactNode } from "react";
import { hasCosts, hasStationNames, type Listed, OsmCredit, SessionHeader, SessionRow } from "@/components/session-row";
import { ChartCard } from "@/components/chart-card";
import { Bars } from "@/components/stats/bars";
import { barsSpan } from "@/components/stats/chart-caption";
import { ChargeLevelChart } from "@/components/stats/charge-level";
import { TripTable } from "@/components/stats/drive-list";
import { hasBars, knownBar } from "@/components/stats/driving-sections";
import { Figures } from "@/components/stats/figures";
import type { View } from "@/components/stats/periods";
import { DRIVE_DAYS, type Drive, type DrainSummary, type ParkedNow } from "@/lib/drives";
import { groupTrips } from "@/lib/trips";
import { type Bill, billsBySlot } from "@/lib/charging-figures";
import type { ChargeLevel } from "@/lib/charge-level";
import type { DrivingFigures } from "@/lib/driving-figures";
import { formatDuration, formatPower } from "@/lib/format";
import { inSpan } from "@/lib/periods";
import { eachFrame, type HomeFrame } from "./frames";
import { MoreLink } from "./more-link";

// Each topic on the home page: its main chart for the period and its newest three rows in it. Everything
// else is on its Stats page, one tap away. Every section follows the one switch at the top (see frames.tsx).

const ROWS = 3;
const number = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

function Section({ title, view, more, children }: { title: string; view: View; more: string; children: ReactNode }) {
  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium tracking-heading">{title}</h2>
        <MoreLink view={view}>{more}</MoreLink>
      </div>
      {children}
    </section>
  );
}

// Rows keep their columns and scroll sideways on a phone, like the lists on the Stats pages. A header
// names the columns above them.
function Rows({ header, children }: { header?: ReactNode; children: ReactNode }) {
  return (
    <div className="max-sm:-mx-1 max-sm:overflow-x-auto max-sm:overflow-y-hidden max-sm:px-1">
      <div className="max-sm:min-w-xl">
        {header}
        <ul className="divide-y border-t">{children}</ul>
      </div>
    </div>
  );
}

// Spend per bar from real bills (Tesla's and the invoices attached, as in Spent and on Charging), then the
// newest sessions in the period.
export function ChargingSection({ frames, bills, listed, now }: { frames: HomeFrame[]; bills: Bill[]; listed: Listed[]; now: number }) {
  if (listed.length === 0) return null;
  const currency = listed.find((item) => item.tesla?.currency)?.tesla?.currency ?? "INR";
  const compact = new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 });
  const chart = ({ frame }: HomeFrame) => {
    const spend = billsBySlot(bills, frame.slots);
    // A slot ahead of now is blank, never ₹0; those before the first bill are hidden by Bars itself.
    const bars = frame.slots.map((slot, k) => ({
      key: String(slot.id),
      label: slot.label,
      axis: slot.axis,
      edge: slot.edge,
      value: slot.ahead ? 0 : spend[k],
      display: slot.ahead ? "" : compact.format(spend[k]),
      isCurrent: slot.isCurrent,
      blank: slot.ahead || undefined,
    }));
    return (
      <ChartCard
        as="h3"
        title="Spend"
        description="What charging cost."
        info="From Tesla's Supercharger bills and the invoices you attached."
        caption={barsSpan(frame)}
        empty={hasBars(bars) ? undefined : `No bills ${frame.words}`}
      >
        <Bars bars={bars} ariaLabel={`Spend per ${frame.slotName}`} prefix="₹" labelEvery={frame.labelEvery} fit />
      </ChartCard>
    );
  };
  const rows = ({ frame }: HomeFrame) => {
    const shown = listed.filter((item) => inSpan(Date.parse(item.started_at), frame.span)).slice(0, ROWS);
    if (shown.length === 0) return <p className="text-sm text-muted-foreground">No charging sessions {frame.words}.</p>;
    const costs = hasCosts(shown);
    return (
      <div>
        <Rows header={<SessionHeader costs={costs} wide />}>
          {shown.map((item) => (
            <SessionRow key={item.key} item={item} now={now} costs={costs} />
          ))}
        </Rows>
        {hasStationNames(shown) && <OsmCredit className="mt-3" />}
      </div>
    );
  };
  return (
    <Section title="Charging" view="charging" more="See all sessions">
      {eachFrame(frames, chart, { steady: true })}
      {eachFrame(frames, rows)}
    </Section>
  );
}

// Distance per bar, then the newest trips in the period. Trips are rebuilt from the last DRIVE_DAYS of
// readings, so a period that starts earlier says so rather than look complete.
export function DrivingSection({ frames, figures, drives, now }: { frames: HomeFrame[]; figures: DrivingFigures; drives: Drive[]; now: number }) {
  if (!figures.periods.all.current.km && drives.length === 0) return null;
  const trips = groupTrips(drives);
  const tripsFrom = now - DRIVE_DAYS * 86_400_000;
  const chart = ({ frame, driving }: HomeFrame) => {
    // A slot with no reading (before tracking began, or ahead of now) is blank, never 0 km.
    const bars = frame.slots.map((slot, k) => knownBar(slot, driving ? (driving.bars[k]?.km ?? null) : null, number.format));
    const empty = !driving ? "Couldn't read the distance for these dates" : hasBars(bars) ? undefined : `No driving ${frame.words}`;
    return (
      <ChartCard as="h3" title="Distance" description="Kilometres driven." caption={barsSpan(frame)} empty={empty}>
        <Bars bars={bars} ariaLabel={`Distance per ${frame.slotName} in km`} unit="km" labelEvery={frame.labelEvery} fit />
      </ChartCard>
    );
  };
  const rows = ({ frame }: HomeFrame) => {
    if (drives.length === 0) return null;
    const shown = trips.filter((t) => inSpan(t.start, frame.span)).slice(0, ROWS);
    // Tracking began before the trips' window and the period reaches back past it.
    const partial = frame.span.from < tripsFrom && (figures.since === null || figures.since < tripsFrom);
    return (
      <div className="space-y-3">
        {shown.length > 0 ? (
          <TripTable trips={shown} serialOf={(t) => trips.length - trips.indexOf(t)} now={now} />
        ) : (
          <p className="text-sm text-muted-foreground">No trips {frame.words}.</p>
        )}
        {partial && <p className="text-xs text-faint">Trips cover only the last {DRIVE_DAYS} days.</p>}
      </div>
    );
  };
  return (
    <Section title="Driving" view="driving" more="See all trips">
      {eachFrame(frames, chart, { steady: true })}
      {eachFrame(frames, rows)}
    </Section>
  );
}

// What the car loses parked, now and usually, which no period changes, then its charge level over the period.
export function BatterySection({
  frames,
  level,
  drain,
  parkedNow,
  now,
}: {
  frames: HomeFrame[];
  level: ChargeLevel | null;
  drain: DrainSummary | null;
  parkedNow: ParkedNow | null;
  now: number;
}) {
  const hasLevel = (level?.points.length ?? 0) >= 2;
  if (!hasLevel && !parkedNow && !drain) return null;
  // The usual loss a day is context for what this stretch has lost; with no loss to show it stands alone.
  const usually = drain && `${oneDecimal.format(drain.percentPerDay)}% a day`;
  const lost = parkedNow?.lostPercent ?? null;
  return (
    <Section title="Battery" view="battery" more="See battery details">
      {(parkedNow || usually) && (
        <div className="space-y-3">
          {parkedNow && (
            <>
              <h3 className="text-sm font-medium">Parked now</h3>
              <Figures
                figures={[
                  {
                    label: "Parked for",
                    value: `${parkedNow.fromFirstReading ? "≥ " : ""}${formatDuration(parkedNow.hours * 3600)}`,
                    note: parkedNow.fromFirstReading ? "Since Uplink's first reading" : undefined,
                  },
                  parkedNow.watts !== null && { label: "Avg power", value: formatPower(parkedNow.watts) },
                  lost !== null && { label: "Lost", value: `${oneDecimal.format(lost)}%`, note: usually ? `Usually ${usually}` : undefined },
                ]}
                label="Parked now"
                terms={parkedNow.watts !== null ? ["W"] : []}
              />
            </>
          )}
          {usually && lost === null && <p className="text-sm text-muted-foreground tabular-nums">Usually loses {usually} parked</p>}
        </div>
      )}
      {hasLevel && eachFrame(frames, ({ frame }) => <ChargeLevelChart level={level} now={now} frame={frame} />, { steady: true })}
    </Section>
  );
}
