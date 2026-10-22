import Link from "next/link";
import { ShowMore } from "@/components/show-more";
import { SessionRow } from "@/components/session-row";
import { statsHref } from "@/components/stats/periods";
import { formatDayLabel, formatShortDate } from "@/lib/format";
import { compareToLastWeek, type Comparison, type WeekSummary } from "@/lib/dashboard-summary";
import type { VehicleExtras } from "@/lib/server/dashboard-extras";
import { LIST_PREVIEW } from "@/lib/list";
import { cn } from "@/lib/utils";

const heading = "text-xs font-medium tracking-wide text-faint uppercase";
const number = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function Stat({ href, label, value, unit, note }: { href: string; label: string; value: string; unit: string; note: Comparison | null }) {
  return (
    <Link
      href={href}
      prefetch={true}
      className="group block space-y-1 border p-4 transition-colors duration-150 hover:border-muted-foreground/50"
    >
      <p className="text-xs text-faint transition-colors duration-150 group-hover:text-foreground">{label}</p>
      <p className="font-mono text-2xl font-medium tracking-tight tabular-nums">
        {value}
        <span className="ml-1 text-xs font-normal text-faint">{unit}</span>
      </p>
      {note && (
        <p
          className={cn(
            "text-xs whitespace-nowrap",
            note.tone === "better" ? "text-chart-better" : note.tone === "worse" ? "text-chart-worse" : "text-muted-foreground",
          )}
        >
          {note.text}
        </p>
      )}
    </Link>
  );
}

// The last 7 days in two numbers, each with a line against the 7 days before; both open the driving
// stats. Hidden when nothing is known.
export function WeekStrip({ week }: { week: WeekSummary | null }) {
  if (!week) return null;
  const driving = statsHref("driving", "month");
  // With nothing to compare against, say how far back the readings go instead.
  const coverage: Comparison | null = week.since !== null ? { text: `Tracking since ${formatShortDate(week.since)}`, tone: "neutral" } : null;
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h3 className={heading}>This week</h3>
        <p className="text-xs text-faint">Compared with the 7 days before</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {week.km !== null && <Stat href={driving} label="Driven" value={number.format(week.km)} unit="km" note={compareToLastWeek(week.km, week.previous.km, "km") ?? coverage} />}
        {week.whPerKm !== null && (
          <Stat
            href={driving}
            label="Efficiency"
            value={number.format(week.whPerKm)}
            unit="Wh/km"
            note={compareToLastWeek(week.whPerKm, week.previous.whPerKm, "Wh/km", { lowerIsBetter: true }) ?? coverage}
          />
        )}
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
      <div className="max-sm:-mx-1 max-sm:overflow-x-auto max-sm:overflow-y-hidden max-sm:px-1">
        <ul className="border-t max-sm:min-w-xl">
          <SessionRow item={item} now={now} />
        </ul>
      </div>
    </section>
  );
}


function ActivityRows({ events, now }: { events: VehicleExtras["activity"]; now: number }) {
  return (
    <ul className="divide-y border-t text-sm">
      {events.map((e) => (
        <li key={`${e.at}-${e.text}`} className="flex gap-4 py-2.5">
          <span className="w-20 shrink-0 text-faint tabular-nums">{formatDayLabel(e.at, now)}</span>
          <span className="min-w-0 text-muted-foreground tabular-nums">{e.text}</span>
        </li>
      ))}
    </ul>
  );
}

export function RecentActivity({ events, now }: { events: VehicleExtras["activity"]; now: number }) {
  if (events.length === 0) return null;
  const rest = events.slice(LIST_PREVIEW);
  return (
    <section className="space-y-3">
      <h3 className={heading}>Recent activity</h3>
      <div>
        <ActivityRows events={events.slice(0, LIST_PREVIEW)} now={now} />
        {rest.length > 0 && (
          <ShowMore count={rest.length}>
            <ActivityRows events={rest} now={now} />
          </ShowMore>
        )}
      </div>
    </section>
  );
}
