import { Zap } from "lucide-react";
import { type ReactNode, Suspense, ViewTransition } from "react";
import { EmptyState } from "@/components/empty-state";
import { Header } from "@/components/header";
import { PeriodPicker, PeriodScope } from "./period-scope";
import { type CustomScope, PAGE_PERIODS, type View } from "./periods";
import { ViewTabs, ViewTabsShell } from "./view-tabs";

// What every Stats page shows around its sections, once its data is in: when the sections use one, the
// period switch with Custom. The topic tabs are in the page's shell (StatsPage), so they don't reload. The period is the URL's (see PeriodScope); a page without
// the switch still keeps a range picked by date in its links.
export function StatsFrame({ custom, periodSwitch = true, children }: { custom: CustomScope; periodSwitch?: boolean; children: ReactNode }) {
  return (
    <PeriodScope periods={PAGE_PERIODS.stats} custom={custom}>
      {/* Fades in over the skeleton when the topic's data arrives (see StatsSkeleton); nothing else moves. */}
      <ViewTransition enter="stats-in" default="none">
        <div className="space-y-12">
          {periodSwitch && <PeriodPicker />}
          {children}
        </div>
      </ViewTransition>
    </PeriodScope>
  );
}

// The page around the frame: header, title and the topic tabs, all in the static shell, so moving between
// topics only swaps what's under the tabs. The loading and the data go in `children`.
export function StatsPage({ view, description, children }: { view: View; description: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6 pb-12 sm:pt-8 sm:pb-20">
      <Header current="stats" />
      <h1 className="text-[1.5rem] font-medium tracking-heading max-sm:text-[1.25rem]">Stats</h1>
      <p className="mt-2 mb-12 text-sm text-muted-foreground">{description}</p>
      <div className="mb-6">
        <Suspense fallback={<ViewTabsShell view={view} />}>
          <ViewTabs view={view} />
        </Suspense>
      </div>
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
    <ViewTransition exit="stats-out" default="none">
      <div role="status" aria-busy="true" className="space-y-12">
        <span className="sr-only">Loading…</span>
        {/* Where the period switch will be, so nothing below jumps when it arrives. */}
        <div className={`h-7 w-72 max-w-full max-sm:h-9 ${block}`} />
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
    </ViewTransition>
  );
}
