import { formatKm, formatShortDate } from "@/lib/format";
import type { WeeklyRange } from "@/lib/charge-level";

// What a full charge would show as rated range now (weekly median), and how that moved since the
// first week on record. The pack estimate above is in kWh; this is the same health in km.
export function ProjectedRange({ weeks }: { weeks: WeeklyRange[] }) {
  if (weeks.length === 0) return null;
  const latest = weeks[weeks.length - 1];
  const first = weeks[0];
  const change = latest.km - first.km;
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-medium tracking-wide text-faint uppercase">Range at 100%</h2>
      <p className="font-mono text-4xl font-medium tracking-tight tabular-nums">≈ {formatKm(latest.km)}</p>
      <p className="text-sm text-muted-foreground tabular-nums">
        {weeks.length < 2
          ? "Rated range at a full charge, this week's median"
          : change === 0
            ? `Rated range at a full charge, same as the week of ${formatShortDate(first.weekStart)}`
            : `Rated range at a full charge, ${formatKm(Math.abs(change))} ${change < 0 ? "less" : "more"} than the week of ${formatShortDate(first.weekStart)}`}
      </p>
    </section>
  );
}
