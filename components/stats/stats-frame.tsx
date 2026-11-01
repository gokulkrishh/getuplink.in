import { Zap } from "lucide-react";
import { type ReactNode, ViewTransition } from "react";
import { EmptyState } from "@/components/empty-state";
import { Header } from "@/components/header";
import { Loading } from "@/components/skeleton";
import { DatesNote } from "./dates-note";
import { PeriodPicker, PeriodScope } from "./period-scope";
import { type CustomScope, type View, viewPeriods, VIEWS } from "./periods";
import { Skeleton } from "@/components/ui/skeleton";

// What every Stats page shows around its sections, once its data is in: when the sections use one, the
// period switch with Custom. The page's title is in its shell (StatsPage), so it doesn't reload. The period is the URL's (see PeriodScope); a page without
// the switch still keeps a range picked by date in its links. `view` names the page, for the period it opens
// on (see viewPeriods). Required, so a page with its own opening period can't fall back to Stats'.
export function StatsFrame({ view, custom, periodSwitch = true, children }: { view: View; custom: CustomScope; periodSwitch?: boolean; children: ReactNode }) {
  return (
    <PeriodScope periods={viewPeriods(view)} custom={custom}>
      {/* Fades in over the skeleton when the topic's data arrives (see StatsSkeleton); nothing else moves. */}
      <ViewTransition enter="stats-in" default="none">
        <div className="space-y-12">
          {periodSwitch && (
            <div className="space-y-3">
              <PeriodPicker />
              <DatesNote />
            </div>
          )}
          {children}
        </div>
      </ViewTransition>
    </PeriodScope>
  );
}

// The page around the frame: the header (where Driving, Charging and Battery are links) and the topic's
// title and line, all in the static shell. The loading and the data go in `children`.
export function StatsPage({ view, description, children }: { view: View; description: string; children: ReactNode }) {
  return (
    <div className="group/stats mx-auto w-full max-w-2xl px-5 pt-6 pb-12 sm:pt-8 sm:pb-20">
      <Header current={view} />
      <div className="mb-12">
        <h1 className="text-[1.5rem] font-medium tracking-heading max-sm:text-[1.25rem]">{VIEWS.find((v) => v.value === view)?.label}</h1>
        {/* An empty topic (NotYet) hides it: the line promises what the page doesn't have yet. */}
        <p className="mt-2 text-sm text-muted-foreground group-has-[[data-not-yet]]/stats:hidden">{description}</p>
      </div>
      {children}
    </div>
  );
}

// A topic with too little data to show yet: the same card on every Stats page, titled "No <things> yet"
// with one line on what fills it. Its marker hides the page's subtitle (see StatsPage).
export function NotYet({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div data-not-yet>
      <EmptyState icon={<Zap className="size-7 text-faint" aria-hidden="true" />} title={title}>
        {children}
      </EmptyState>
    </div>
  );
}

// The page's loading screen: the period switch's place, then the page's own blocks (see skeletons.tsx),
// in the same stack as StatsFrame, so nothing moves when the data arrives.
export function StatsSkeleton({ children }: { children: ReactNode }) {
  return (
    <ViewTransition exit="stats-out" default="none">
      <Loading className="space-y-12">
        <SkPeriodSwitch />
        <div className="space-y-12">{children}</div>
      </Loading>
    </ViewTransition>
  );
}

// The period switch's place: one block the size of the real switch (see Segmented).
function SkPeriodSwitch() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      {/* One block the switch's size: the labels are there only to give it its width. */}
      <Skeleton className="inline-flex max-w-full rounded-lg">
        {PERIODS_SHOWN.map((label) => (
          <span key={label} className="tap-target invisible inline-flex h-[calc(2rem+2px)] items-center justify-center border-y px-2.5 text-[0.8rem] first:border-l last:border-r max-sm:h-[calc(2.5rem+2px)] max-sm:px-2">
            {label}
          </span>
        ))}
      </Skeleton>
    </div>
  );
}

const PERIODS_SHOWN = ["Day", "Week", "Month", "Year", "All", "Custom"];
