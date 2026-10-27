import { formatDays } from "@/lib/format";
import { inPeriod, inSpan, monthIndex, type Period, PERIOD_WORDS, type Timeframe } from "@/lib/periods";
import { type UpdateRow, updateStats } from "@/lib/telemetry-derive";
import { Measure } from "@/components/measure";

// How many updates a period saw, by IST month as updates are counted (see inPeriod), or a range picked by
// date, by the day each was seen.
export function updatesIn(rows: UpdateRow[], covers: Period | Pick<Timeframe, "span">, now: number): number {
  if (typeof covers !== "string") return rows.filter((r) => inSpan(Date.parse(r.detected_at), covers.span)).length;
  const cur = monthIndex(now);
  return rows.filter((r) => inPeriod(covers, monthIndex(r.detected_at), cur)).length;
}

// How long updates take to arrive and how often. Needs two real updates to say anything. Only the count
// depends on the period or range (`covers`); the rest covers every update. The caller gives the section
// its heading.
export function UpdateStats({ rows, now, covers }: { rows: UpdateRow[]; now: number; covers: Period | Timeframe }) {
  const stats = updateStats(rows, now);
  if (!stats) return null;
  const count = updatesIn(rows, covers, now);
  const items = [
    stats.avgWaitSec !== null && { label: "Average wait from offered to installed", value: formatDays(stats.avgWaitSec) },
    { label: `Updates ${typeof covers === "string" ? PERIOD_WORDS[covers] : covers.words}`, value: String(count) },
    { label: "Average time between updates", value: formatDays(stats.avgGapSec) },
    { label: "Longest on one version", value: formatDays(stats.longestSec) },
  ].filter((item) => item !== false);
  return (
    <div className="space-y-4">
      <dl className="divide-y border-t">
        {items.map((item) => (
          <div key={item.label} className="flex items-baseline justify-between gap-4 py-3 text-sm">
            <dt className="text-muted-foreground">{item.label}</dt>
            <dd className="font-mono font-medium tabular-nums"><Measure text={String(item.value)} /></dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
