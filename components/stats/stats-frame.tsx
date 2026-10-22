import { Zap } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/empty-state";
import { Header } from "@/components/header";
import type { Period } from "@/lib/periods";
import { ByPeriod, PeriodPicker, PeriodScope } from "./period-scope";
import { PERIODS, type View } from "./periods";
import { ViewTabs } from "./view-tabs";

// A section that depends on the period, rendered for each one so the switch needs no server trip (see ByPeriod).
export function eachPeriod(render: (period: Period) => ReactNode) {
  return <ByPeriod panels={Object.fromEntries(PERIODS.map(({ value }) => [value, render(value)]))} />;
}

// What every Stats page shows around its sections, once its data is in: the topic links and, when the
// sections use one, the period switch. `period` is the one in the URL.
export function StatsFrame({ view, period, periodSwitch = true, children }: { view: View; period: Period; periodSwitch?: boolean; children: ReactNode }) {
  return (
    <PeriodScope initial={period}>
      <div className="space-y-12">
        <div className="space-y-6">
          <ViewTabs view={view} />
          {periodSwitch && <PeriodPicker />}
        </div>
        {children}
      </div>
    </PeriodScope>
  );
}

// The page around the frame: header and title. The loading and the data go in `children`.
export function StatsPage({ description, children }: { description: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-12 sm:py-20">
      <Header />
      <h1 className="text-2xl font-medium tracking-heading">Stats</h1>
      <p className="mt-2 mb-12 text-sm text-muted-foreground">{description}</p>
      {children}
    </div>
  );
}

// A topic with too little data to show yet.
export function NotYet({ title, children }: { title: string; children: ReactNode }) {
  return (
    <EmptyState icon={<Zap className="size-7 text-faint" aria-hidden="true" />} title={title}>
      {children}
    </EmptyState>
  );
}

export function StatsSkeleton() {
  const block = "bg-muted motion-safe:animate-pulse";
  return (
    <div role="status" aria-busy="true" className="space-y-12">
      <span className="sr-only">Loading…</span>
      <div className="space-y-8">
        <div className="space-y-2">
          <div className={`h-4 w-28 ${block}`} />
          <div className={`h-10 w-48 ${block}`} />
          <div className={`h-4 w-64 ${block}`} />
        </div>
        <div className={`h-36 w-full ${block}`} />
      </div>
      <div className={`h-40 w-full ${block}`} />
    </div>
  );
}
