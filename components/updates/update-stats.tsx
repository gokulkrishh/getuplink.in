import { formatDays } from "@/lib/format";
import { inPeriod, monthIndex, type Period, PERIOD_WORDS } from "@/lib/periods";
import { type UpdateRow, updateStats } from "@/lib/telemetry-derive";

// How long updates take to arrive and how often. Needs two real updates to say anything. Only the count
// depends on the period; the rest covers every update. The caller gives the section its heading.
export function UpdateStats({ rows, now, period }: { rows: UpdateRow[]; now: number; period: Period }) {
  const stats = updateStats(rows, now);
  if (!stats) return null;
  const cur = monthIndex(now);
  const count = rows.filter((r) => inPeriod(period, monthIndex(r.detected_at), cur)).length;
  const items = [
    stats.avgWaitSec !== null && { label: "Average wait, available to installed", value: formatDays(stats.avgWaitSec) },
    { label: `Updates ${PERIOD_WORDS[period]}`, value: String(count) },
    { label: "Average time between updates", value: formatDays(stats.avgGapSec) },
    { label: "Longest on one version", value: formatDays(stats.longestSec) },
  ].filter((item) => item !== false);
  return (
    <div className="space-y-4">
      <dl className="divide-y border-t">
        {items.map((item) => (
          <div key={item.label} className="flex items-baseline justify-between gap-4 py-3 text-sm">
            <dt className="text-muted-foreground">{item.label}</dt>
            <dd className="font-mono font-medium tabular-nums">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
