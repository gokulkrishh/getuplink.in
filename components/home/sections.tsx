import type { ReactNode } from "react";
import { hasCosts, hasStationNames, type Listed, OsmCredit, SessionHeader, SessionRow } from "@/components/session-row";
import { Bars } from "@/components/stats/bars";
import { ChargeLevelChart } from "@/components/stats/charge-level";
import { TripTable } from "@/components/stats/drive-list";
import { Figures } from "@/components/stats/figures";
import type { View } from "@/components/stats/periods";
import { DRIVE_DAYS, type Drive, type DrainSummary, type ParkedNow } from "@/lib/drives";
import { groupTrips } from "@/lib/trips";
import { spendBySlot } from "@/lib/charging-figures";
import type { ChargeLevel } from "@/lib/charge-level";
import type { DrivingFigures } from "@/lib/driving-figures";
import { formatDuration, formatPower } from "@/lib/format";
import { inSpan } from "@/lib/periods";
import type { ChargingSession } from "@/lib/server/charging";
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

// Spend per bar (Tesla's Supercharger bill, as in Spent), then the newest sessions in the period.
export function ChargingSection({ frames, sessions, listed, now }: { frames: HomeFrame[]; sessions: ChargingSession[]; listed: Listed[]; now: number }) {
  if (listed.length === 0) return null;
  const currency = sessions.find((s) => s.currency)?.currency ?? "INR";
  const compact = new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 });
  const chart = ({ frame }: HomeFrame) => {
    const spend = spendBySlot(sessions, frame.slots);
    const bars = frame.slots.map((slot, k) => ({ key: String(slot.id), label: slot.label, value: spend[k], display: compact.format(spend[k]), isCurrent: slot.isCurrent }));
    return <Bars bars={bars} ariaLabel={`Spend per ${frame.slotName}`} prefix="₹" labelEvery={frame.labelEvery} empty={`No charging spend ${frame.words}`} />;
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
    const bars = frame.slots.map((slot, k) => {
      const value = driving?.bars[k]?.km ?? 0;
      return { key: String(slot.id), label: slot.label, value, display: number.format(value), isCurrent: slot.isCurrent };
    });
    const empty = driving ? `No driving ${frame.words}` : "Couldn't read the distance for these dates";
    return <Bars bars={bars} ariaLabel={`Distance per ${frame.slotName} in km`} unit="km" labelEvery={frame.labelEvery} empty={empty} />;
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
              />
            </>
          )}
          {usually && lost === null && <p className="text-sm text-muted-foreground tabular-nums">Usually loses {usually} parked</p>}
        </div>
      )}
      {hasLevel && eachFrame(frames, ({ frame }) => <ChargeLevelChart level={level} now={now} frame={frame} />)}
    </Section>
  );
}
