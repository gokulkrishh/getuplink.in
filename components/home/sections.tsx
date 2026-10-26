import type { ReactNode } from "react";
import { hasCosts, hasStationNames, type Listed, OsmCredit, SessionHeader, SessionRow } from "@/components/session-row";
import { ChartCard } from "@/components/chart-card";
import { Bars } from "@/components/stats/bars";
import { barsSpan } from "@/components/stats/chart-caption";
import { ChargeLevelChart } from "@/components/stats/charge-level";
import { TripTable } from "@/components/stats/drive-list";
import { hasBars, knownBars } from "@/components/stats/driving-sections";
import { Figures } from "@/components/stats/figures";
import type { View } from "@/components/stats/periods";
import { DRIVE_DAYS, type Drive, drainSummary, type ParkedNow, type ParkedPeriod } from "@/lib/drives";
import { backTo, overlapping } from "@/lib/kept";
import { groupTrips } from "@/lib/trips";
import { type Bill, billsBySlot } from "@/lib/charging-figures";
import type { ChargeLevel } from "@/lib/charge-level";
import type { DrivingFigures } from "@/lib/driving-figures";
import { DECIMALS, formatDuration, formatMoney, formatPercent, formatPower } from "@/lib/format";
import { inSpan } from "@/lib/periods";
import { fromSince } from "@/lib/frames";
import { eachFrame, type HomeFrame } from "./frames";
import { MoreLink } from "./more-link";

// Each topic on the home page: its main chart for the period and its newest three rows in it. Everything
// else is on its Stats page, one tap away. Every section follows the one switch at the top (see frames.tsx).

const ROWS = 3;

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

// A period with nothing in a section says so in one line, in place of its chart and rows together.
function Quiet({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

// Spend per bar from real bills (Tesla's and the invoices attached, as in Spent and on Charging), then the
// newest sessions in the period. A period with neither is one line ("No charging today."), so the
// sections aren't held open to a chart's height (no `steady`).
// The chart starts at the first charge's day (`chargingSince`, see fromSince).
export function ChargingSection({ frames, bills, listed, chargingSince, now }: { frames: HomeFrame[]; bills: Bill[]; listed: Listed[]; chargingSince: number | null; now: number }) {
  if (listed.length === 0) return null;
  const currency = listed.find((item) => item.tesla?.currency)?.tesla?.currency ?? "INR";
  const body = (f: HomeFrame) => {
    // The bars start at the first charge's day (see fromSince).
    const { frame } = fromSince(f, chargingSince, now);
    // A slot ahead of now is blank, never ₹0; those before the first bill are hidden by Bars itself. To the
    // paisa and rounded together, so the bars add up to Spent above as shown.
    const { bars } = knownBars(frame.slots, billsBySlot(bills, frame.slots), DECIMALS.money, (n) => formatMoney(n, currency));
    const shown = listed.filter((item) => inSpan(Date.parse(item.started_at), f.frame.span)).slice(0, ROWS);
    if (!hasBars(bars) && shown.length === 0) return <Quiet>No charging {f.frame.words}.</Quiet>;
    const costs = hasCosts(shown);
    return (
      <div className="space-y-6">
        <ChartCard
          as="h3"
          title="Spend"
          description="What charging cost."
          info="From Tesla's Supercharger bills and the invoices you attached."
          caption={barsSpan(frame)}
          empty={hasBars(bars) ? undefined : `No bills ${frame.words}.`}
        >
          <Bars bars={bars} view="charging" ariaLabel={`Spend per ${frame.slotName}`} prefix="₹" labelEvery={frame.labelEvery} fit />
        </ChartCard>
        {shown.length === 0 ? (
          <Quiet>No charging sessions {f.frame.words}.</Quiet>
        ) : (
          <div>
            <Rows header={<SessionHeader costs={costs} wide />}>
              {shown.map((item) => (
                <SessionRow key={item.key} item={item} now={now} costs={costs} />
              ))}
            </Rows>
            {hasStationNames(shown) && <OsmCredit className="mt-3" />}
          </div>
        )}
      </div>
    );
  };
  return (
    <Section title="Charging" view="charging" more="See all sessions">
      {eachFrame(frames, body)}
    </Section>
  );
}

// Distance per bar, then the newest trips in the period; a period with neither is one line. Trips are
// rebuilt from the last DRIVE_DAYS of readings, so a period that starts earlier says so rather than look
// complete.
export function DrivingSection({ frames, figures, drives, now }: { frames: HomeFrame[]; figures: DrivingFigures; drives: Drive[]; now: number }) {
  if (!figures.periods.all.current.km && drives.length === 0) return null;
  const trips = groupTrips(drives);
  const tripsFrom = now - DRIVE_DAYS * 86_400_000;
  const body = (f: HomeFrame) => {
    // The bars start at the first odometer reading's day (see fromSince).
    const { frame, driving } = fromSince(f, figures.since, now);
    // A slot with no reading (before tracking began, or ahead of now) is blank, never 0 km.
    // Rounded together like the headline's Driven, so they add up to it as shown.
    const { bars } = knownBars(frame.slots, frame.slots.map((_, k) => (driving ? (driving.bars[k]?.km ?? null) : null)), DECIMALS.km);
    const shown = trips.filter((t) => inSpan(t.start, f.frame.span)).slice(0, ROWS);
    // Tracking began before the trips' window and the period reaches back past it.
    const partial = f.frame.span.from < tripsFrom && (figures.since === null || figures.since < tripsFrom);
    // A period with no distance and no trips is one line, as in ChargingSection.
    if (driving && !hasBars(bars) && shown.length === 0) return <Quiet>No driving {f.frame.words}.</Quiet>;
    const empty = !driving ? "Couldn't read the distance for these dates." : hasBars(bars) ? undefined : `No driving ${frame.words}.`;
    return (
      <div className="space-y-6">
        <ChartCard as="h3" title="Distance" description="Kilometres driven." caption={barsSpan(frame)} empty={empty}>
          <Bars bars={bars} view="driving" ariaLabel={`Distance per ${frame.slotName} in km`} unit="km" labelEvery={frame.labelEvery} fit />
        </ChartCard>
        {drives.length > 0 && (
          <div className="space-y-3">
            {shown.length > 0 ? <TripTable trips={shown} serialOf={(t) => trips.length - trips.indexOf(t)} now={now} /> : <Quiet>No trips {f.frame.words}.</Quiet>}
            {partial && <p className="text-sm text-faint">Trips cover only the last {DRIVE_DAYS} days.</p>}
          </div>
        )}
      </div>
    );
  };
  return (
    <Section title="Driving" view="driving" more="See all trips">
      {eachFrame(frames, body)}
    </Section>
  );
}

// What the car loses parked over the period: the stretch it is parked in now, while the period reaches now,
// and the usual loss a day over the stretches in the period (their median, once there are two, as on the
// Battery page). Then its charge level over the period.
export function BatterySection({
  frames,
  level,
  parked,
  parkedNow,
  now,
}: {
  frames: HomeFrame[];
  level: ChargeLevel | null;
  parked: ParkedPeriod[];
  parkedNow: ParkedNow | null;
  now: number;
}) {
  const hasLevel = (level?.points.length ?? 0) >= 2;
  if (!hasLevel && !parkedNow && parked.length === 0) return null;
  const drain = ({ frame }: HomeFrame) => {
    const { span } = frame;
    const ongoing = parkedNow && parkedNow.start < span.to && parkedNow.end >= span.from ? parkedNow : null;
    const finished = overlapping(parked, span, (p) => p.start, (p) => p.end);
    // The usual loss a day is context for what this stretch has lost; with no loss to show it stands alone.
    const summary = drainSummary(finished);
    // "a day this month"; All's "in total" would read wrong after "a day", so it says only "a day".
    const usually = summary && `${formatPercent(summary.percentPerDay, 1)} a day${frame.period === "all" ? "" : ` ${frame.words}`}`;
    const lost = ongoing?.lostPercent ?? null;
    if (!ongoing && !usually) return null;
    // Stretches are kept for DRAIN_DAYS, so a longer period says how far back the usual loss reaches.
    const cut = usually && backTo(span, parked[0]?.start, "Stretches");
    return (
      <div className="space-y-3">
        {ongoing && (
          <>
            <h3 className="text-sm font-medium">Parked now</h3>
            <Figures
              figures={[
                {
                  label: "Parked for",
                  value: `${ongoing.fromFirstReading ? "≥ " : ""}${formatDuration(ongoing.hours * 3600)}`,
                  note: ongoing.fromFirstReading ? "Since Uplink's first reading" : undefined,
                },
                ongoing.watts !== null && { label: "Avg power", value: formatPower(ongoing.watts) },
                lost !== null && { label: "Lost", value: formatPercent(lost, 1), note: usually ? `Usually ${usually}` : undefined },
              ]}
              label="Parked now"
              terms={ongoing.watts !== null ? ["W"] : []}
            />
          </>
        )}
        {usually && lost === null && <p className="text-sm text-muted-foreground tabular-nums">Usually loses {usually} parked</p>}
        {cut && <p className="text-sm text-faint">{cut}.</p>}
      </div>
    );
  };
  return (
    <Section title="Battery" view="battery" more="See battery details">
      {(parkedNow || parked.length > 0) && eachFrame(frames, drain)}
      {hasLevel && eachFrame(frames, ({ frame }) => <ChargeLevelChart level={level} now={now} frame={frame} />)}
    </Section>
  );
}
