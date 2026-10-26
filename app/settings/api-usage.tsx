import { ChartCard } from "@/components/chart-card";
import { Figures } from "@/components/stats/figures";
import { UsageMeter } from "@/components/usage-meter";
import { formatCount, formatShortDate, formatUsd } from "@/lib/format";
import { CATEGORY_NAMES, SLOW_AT } from "@/lib/tesla-billing";
import type { UsageView } from "@/lib/server/usage";

// How often checks run at this budget level, for the admin's tile and the Live data row.
export function checkCadence(usage: Pick<UsageView, "budget" | "resetsAt">): string {
  if (usage.budget.level === "stopped") return `Paused until ${formatShortDate(usage.resetsAt)}`;
  return usage.budget.level === "slow" ? "Every 12 hours" : "Every 6 hours";
}

const UNITS = { data: "requests", commands: "requests", wakes: "requests", signals: "signals" } as const;

// Settings > Tesla API usage. An admin sees the developer account's month; everyone else, their own share.
export function ApiUsage({ usage }: { usage: UsageView }) {
  const admin = usage.account !== null;
  const shown = usage.account ?? usage.mine;
  const credit = formatUsd(usage.creditUsd);
  const budget = usage.budget.budgetUsd;
  return (
    <ChartCard
      title="Tesla API usage"
      description={admin ? "This month's estimated cost for Uplink's Tesla account." : "Your share of this month's estimated Tesla cost."}
      info={
        <>
          <p>Uplink counts every request it makes and every signal your car streams. Signals are counted once a day.</p>
          <p>Tesla charges $1 for 500 data requests, 1,000 commands, 50 wakes or 150,000 signals, and takes {credit} off each month. Uplink prices every request but a wake as a data request, the dearer guess.</p>
          <p>Tesla&apos;s month starts on the 1st. Uplink never wakes your car.</p>
          {admin && (
            <p>
              Checks slow to every 12 hours from {formatUsd(budget * SLOW_AT)} and stop at {formatUsd(budget)}, until the month resets. Streaming carries on.
            </p>
          )}
        </>
      }
      summary={
        <Figures
          figures={[
            usage.counted && { label: admin ? "Used" : "Your share", value: formatUsd(shown.costUsd), note: `Of the ${credit} monthly credit` },
            { label: "Resets", value: formatShortDate(usage.resetsAt) },
            admin && { label: "Checks", value: checkCadence(usage), note: budget === usage.creditUsd ? undefined : `Budget ${formatUsd(budget)}` },
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
              <dd className="flex gap-4 font-mono whitespace-nowrap tabular-nums">
                {/* On a phone the category name says what is counted; the unit word would wrap. */}
                <span>
                  {formatCount(c.count)} <span className="text-muted-foreground max-sm:sr-only">{UNITS[c.category]}</span>
                </span>
                <span className="w-16 text-right">{formatUsd(c.costUsd)}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </ChartCard>
  );
}
