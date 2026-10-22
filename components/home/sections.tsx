import type { ReactNode } from "react";
import { hasCosts, hasStationNames, type Listed, OsmCredit, SessionHeader, SessionRow } from "@/components/session-row";
import { Bars } from "@/components/stats/bars";
import { BatteryTrend } from "@/components/stats/battery-trend";
import { DriveRow } from "@/components/stats/drive-list";
import type { View } from "@/components/stats/periods";
import { eachPeriod } from "@/components/stats/stats-frame";
import type { Drive, DrainSummary } from "@/lib/drives";
import { spendBySlot } from "@/lib/charging-figures";
import type { WeeklyRange } from "@/lib/charge-level";
import type { DrivingFigures } from "@/lib/driving-figures";
import { formatKm } from "@/lib/format";
import { type Period, SLOT_NAMES, slotsFor } from "@/lib/periods";
import type { ChargingSession } from "@/lib/server/charging";
import type { WeeklyPack } from "@/lib/telemetry-derive";
import { MoreLink } from "./more-link";

// Each topic on the home page: its main chart for the period and its newest three rows. Everything else is
// on its Stats page, one tap away.

const ROWS = 3;
const number = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

function Section({ title, view, more, children }: { title: string; view: View; more: string; children: ReactNode }) {
  return (
    <section className="space-y-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-xs font-medium tracking-wide text-faint uppercase">{title}</h2>
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

// Spend per bar (Tesla's Supercharger bill, as in Spent), then the newest sessions.
export function ChargingSection({ sessions, listed, now }: { sessions: ChargingSession[]; listed: Listed[]; now: number }) {
  if (listed.length === 0) return null;
  const shown = listed.slice(0, ROWS);
  const costs = hasCosts(shown);
  const currency = sessions.find((s) => s.currency)?.currency ?? "INR";
  const compact = new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 });
  const bars = (period: Period) => {
    const slots = slotsFor(period, now);
    const spend = spendBySlot(sessions, slots);
    return slots.map((slot, k) => ({ key: String(slot.id), label: slot.label, value: spend[k], display: compact.format(spend[k]), isCurrent: slot.isCurrent }));
  };
  return (
    <Section title="Charging" view="charging" more="All sessions">
      {eachPeriod((p) => <Bars bars={bars(p)} ariaLabel={`Spend per ${SLOT_NAMES[p]}`} prefix="₹" />, { steady: true })}
      <Rows header={<SessionHeader costs={costs} wide />}>
        {shown.map((item) => (
          <SessionRow key={item.key} item={item} now={now} costs={costs} />
        ))}
      </Rows>
      {hasStationNames(shown) && <OsmCredit className="mt-3" />}
    </Section>
  );
}

// Distance per bar, then the newest drives.
export function DrivingSection({ figures, drives, now }: { figures: DrivingFigures; drives: Drive[]; now: number }) {
  if (!figures.periods.all.current.km && drives.length === 0) return null;
  const bars = (period: Period) =>
    slotsFor(period, now).map((slot, k) => {
      const value = figures.periods[period].bars[k].km ?? 0;
      return { key: String(slot.id), label: slot.label, value, display: number.format(value), isCurrent: slot.isCurrent };
    });
  return (
    <Section title="Driving" view="driving" more="All drives">
      {eachPeriod((p) => <Bars bars={bars(p)} ariaLabel={`Distance per ${SLOT_NAMES[p]} in km`} unit="km" />, { steady: true })}
      {drives.length > 0 && (
        <Rows>
          {drives.slice(0, ROWS).map((d, i) => (
            <DriveRow key={d.start} drive={d} serial={drives.length - i} now={now} />
          ))}
        </Rows>
      )}
    </Section>
  );
}

// The pack's latest weekly estimate with its 12-week line, what a full charge shows as range, and what it
// loses while parked. They cover their own windows, so the period doesn't change them.
export function BatterySection({ trend, range, drain }: { trend: WeeklyPack[]; range: WeeklyRange[]; drain: DrainSummary | null }) {
  const latest = trend.at(-1);
  const full = range.at(-1);
  if (!latest && !full && !drain) return null;
  const details = [full && `${formatKm(full.km)} at 100%`, drain && `${oneDecimal.format(drain.percentPerDay)}% a day parked`].filter(Boolean);
  return (
    <Section title="Battery" view="battery" more="More">
      <div className="space-y-1">
        {latest && (
          <p className="font-mono text-2xl font-medium tracking-tight tabular-nums">
            {latest.kwh.toFixed(1)}
            <span className="ml-1 text-xs font-normal text-faint">kWh est. full pack</span>
          </p>
        )}
        {details.length > 0 && <p className="text-sm text-muted-foreground tabular-nums">{details.join(" · ")}</p>}
      </div>
      {trend.length >= 2 && (
        <div className="space-y-2">
          <BatteryTrend points={trend} />
          <p className="text-xs text-faint">12 weeks, weekly median</p>
        </div>
      )}
    </Section>
  );
}
