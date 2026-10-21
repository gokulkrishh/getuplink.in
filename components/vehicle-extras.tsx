import Link from "next/link";
import { SessionRow } from "@/components/session-row";
import { statsHref } from "@/components/stats/periods";
import { formatDayLabel, formatDays } from "@/lib/format";
import type { WeekSummary } from "@/lib/dashboard-summary";
import type { VehicleExtras } from "@/lib/server/dashboard-extras";
import type { VersionChange } from "@/lib/server/dashboard";
import { updateStats } from "@/lib/telemetry-derive";

const heading = "text-xs font-medium tracking-wide text-faint uppercase";
const number = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function Stat({ href, label, value, unit }: { href: string; label: string; value: string; unit: string }) {
  return (
    <Link href={href} prefetch={true} className="group block space-y-1">
      <p className="text-xs text-faint transition-colors duration-150 group-hover:text-foreground">{label}</p>
      <p className="font-mono text-2xl font-medium tracking-tight tabular-nums">
        {value}
        <span className="ml-1 text-xs font-normal text-faint">{unit}</span>
      </p>
    </Link>
  );
}

// The last 7 days in four numbers; each opens the Stats tab it comes from. Hidden when nothing is known.
export function WeekStrip({ week }: { week: WeekSummary | null }) {
  if (!week) return null;
  const driving = statsHref("driving", "month");
  const charging = statsHref("charging", "month");
  return (
    <section className="space-y-4">
      <h3 className={heading}>This week</h3>
      <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
        {week.km !== null && <Stat href={driving} label="Driven" value={number.format(week.km)} unit="km" />}
        {week.usedKwh !== null && <Stat href={driving} label="Energy used" value={decimal.format(week.usedKwh)} unit="kWh" />}
        {week.chargedKwh !== null && <Stat href={charging} label="Charged" value={decimal.format(week.chargedKwh)} unit="kWh" />}
        {week.whPerKm !== null && <Stat href={driving} label="Efficiency" value={number.format(week.whPerKm)} unit="Wh/km" />}
      </div>
    </section>
  );
}

export function BatteryHealth({ id, kwh }: { id: string; kwh: number | null }) {
  if (kwh === null) return null;
  return (
    <p className="text-xs text-muted-foreground">
      <Link href={`/car/${id}`} prefetch={true} className="tabular-nums hover:text-foreground">
        Battery health {decimal.format(kwh)} kWh
      </Link>
    </p>
  );
}

export function LastCharge({ item, now }: { item: VehicleExtras["lastCharge"]; now: number }) {
  if (!item) return null;
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <h3 className={heading}>Last charge</h3>
        <Link href="/stats" prefetch={true} className="text-xs text-muted-foreground hover:text-foreground">
          All sessions
        </Link>
      </div>
      <ul className="border-t">
        <SessionRow item={item} now={now} />
      </ul>
    </section>
  );
}

export function RecentActivity({ events, now }: { events: VehicleExtras["activity"]; now: number }) {
  if (events.length === 0) return null;
  return (
    <section className="space-y-3">
      <h3 className={heading}>Recent activity</h3>
      <ul className="divide-y border-t text-sm">
        {events.map((e) => (
          <li key={`${e.at}-${e.text}`} className="flex gap-4 py-2.5">
            <span className="w-20 shrink-0 text-faint tabular-nums">{formatDayLabel(e.at, now)}</span>
            <span className="min-w-0 text-muted-foreground tabular-nums">{e.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// "On 2026.38.3.1 for 12 days · an update every 35 days on average". The first part needs the version's
// install date (not the version already on the car when tracking began); the second needs two real updates.
export function UpdateSummary({ version, history, now }: { version: string | null; history: VersionChange[]; now: number }) {
  const current = history[0];
  const real = history.filter((h) => h.previous_version);
  const stats = updateStats(real, now);
  const parts = [
    version && current?.version === version && current.previous_version && `On ${version} for ${formatDays((now - Date.parse(current.detected_at)) / 1000)}`,
    stats && `an update every ${formatDays(stats.avgGapSec)} on average`,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  const text = parts.join(" · ");
  return <p className="pt-2 text-xs text-muted-foreground tabular-nums">{text.charAt(0).toUpperCase() + text.slice(1)}</p>;
}
