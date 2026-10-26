import { ChartCard } from "@/components/chart-card";
import { Figures } from "@/components/stats/figures";
import { UsageMeter } from "@/components/usage-meter";
import { formatCount, formatShortDate, formatUsd } from "@/lib/format";
import { CATEGORY_NAMES } from "@/lib/tesla-billing";
import type { UsageView } from "@/lib/server/usage";

const UNITS = { data: "requests", commands: "requests", wakes: "requests", signals: "signals" } as const;

// Settings > Tesla API usage: this user's share of the month. The developer account's total, and what
// it's made of, is on /admin/costs.
export function ApiUsage({ usage }: { usage: UsageView }) {
  const shown = usage.mine;
  const credit = formatUsd(usage.creditUsd);
  return (
    <ChartCard
      title="Tesla API usage"
      description="Your share of this month's estimated Tesla cost."
      info={
        <>
          <p>Uplink counts every request it makes and every signal your car streams. Signals are counted once a day.</p>
          <p>Tesla charges $1 for 500 data requests, 1,000 commands, 50 wakes or 150,000 signals, and takes {credit} off each month. Uplink prices every request but a wake as a data request, the dearer guess.</p>
          <p>Tesla&apos;s month starts on the 1st. Uplink never wakes your car.</p>
        </>
      }
      summary={
        <Figures
          figures={[
            usage.counted && { label: "Your share", value: formatUsd(shown.costUsd), note: `Of the ${credit} monthly credit` },
            { label: "Resets", value: formatShortDate(usage.resetsAt) },
          ]}
        />
      }
      empty={usage.counted ? undefined : "Not counted yet"}
      caption="Uplink's own count. Tesla's billing page is the source of truth."
    >
      <div className="space-y-4">
        <UsageMeter
          label={`${formatUsd(shown.costUsd)} of ${credit}`}
          parts={shown.categories.map((c) => ({ label: CATEGORY_NAMES[c.category], value: formatUsd(c.costUsd), share: c.costUsd / usage.creditUsd }))}
        />
        <dl className="divide-y border-y text-sm">
          {shown.categories.map((c) => (
            <div key={c.category} className="flex items-baseline justify-between gap-4 py-2.5">
              <dt className="whitespace-nowrap text-muted-foreground">{CATEGORY_NAMES[c.category]}</dt>
              {/* Signals are counted by the daily retention cron, so the month reads 0 until its first run. */}
              {c.category === "signals" && c.count === 0 ? (
                <dd className="whitespace-nowrap text-faint">Counted daily</dd>
              ) : (
                <dd className="flex gap-4 font-mono whitespace-nowrap tabular-nums">
                  {/* On a phone the category name says what is counted; the unit word would wrap. */}
                  <span>
                    {formatCount(c.count)} <span className="text-muted-foreground max-sm:sr-only">{UNITS[c.category]}</span>
                  </span>
                  <span className="w-16 text-right">{formatUsd(c.costUsd)}</span>
                </dd>
              )}
            </div>
          ))}
        </dl>
      </div>
    </ChartCard>
  );
}
