"use client";

import { useTopLoading } from "@/components/top-loader";
import { useRouter, useSearchParams } from "next/navigation";
import { createContext, useContext, useEffect, useOptimistic, useState, useTransition, type ReactNode } from "react";
import { dayIso, isoDay } from "@/lib/periods";
import { cn } from "@/lib/utils";
import { type CustomScope, type DateRange, defaultPeriod, type HomePeriod, PAGE_PERIODS, parsePeriod, type PeriodSet, pickerLine } from "./periods";
import { LIST_KEY, REMEMBERED_LISTS } from "./list-memory";
import { PeriodSwitch } from "./period-switch";

export type { CustomScope, DateRange };

type Scope = {
  period: HomePeriod;
  periods: PeriodSet;
  custom?: CustomScope;
  range: DateRange | null;
  pending: boolean;
  select: (period: HomePeriod) => void;
  pick: (range: DateRange) => void;
};

const PeriodContext = createContext<Scope>({ period: defaultPeriod(PAGE_PERIODS.home), periods: PAGE_PERIODS.home, range: null, pending: false, select: () => {}, pick: () => {} });

// The period picked here and, for Custom, its dates: what links to other pages carry (see statsHref).
export const usePeriod = (): { period: HomePeriod; periods: PeriodSet; range: DateRange | null } => {
  const { period, periods, range } = useContext(PeriodContext);
  return { period, periods, range };
};

// The range the page shows for Custom, and today as the server saw it (null outside a scope with Custom, and
// while a picked range loads, when the address still holds the old dates).
export const useShownRange = (): { range: DateRange | null; today: string | null } => {
  const { range, custom, pending } = useContext(PeriodContext);
  return { range, today: pending ? null : (custom?.today ?? null) };
};

// A section that depends on the period, rendered by the server for each one; shows the one picked. With
// `steady`, every panel stays laid out in one cell and only the picked one shows, so the section keeps the
// height of its tallest period and the page below doesn't move on a switch. While a picked range loads,
// the section fades.
export function ByPeriod({ panels, steady = false }: { panels: Partial<Record<HomePeriod, ReactNode>>; steady?: boolean }) {
  const { period, custom, pending } = useContext(PeriodContext);
  // Only a scope with Custom ever loads, so only its sections get the wrapper that fades.
  if (!steady) return custom ? <div className={cn(pending && "opacity-50 transition-opacity")}>{panels[period] ?? null}</div> : (panels[period] ?? null);
  return (
    // One shrinkable track: a panel that scrolls sideways on a phone (a wide table) must not widen the cell
    // for every other panel, or the whole section runs off the screen.
    <div className={cn("grid grid-cols-[minmax(0,1fr)]", pending && "opacity-50 transition-opacity")}>
      {Object.entries(panels).map(([key, panel]) => (
        <div key={key} data-period={key} inert={key !== period} className={cn("min-w-0 [grid-area:1/1]", key !== period && "invisible")}>
          {panel}
        </div>
      ))}
    </div>
  );
}

// Holds a page's period, read from ?period= (the one the page opens on stays out of it). Every period's panels
// arrive with the page, so switching only replaces the address (which Next's router follows) and needs no
// server trip; a shared link, the logo's link to / and a refresh all show the URL's period. `periods` is
// the page's set (see PAGE_PERIODS): what the switch offers and what it opens on; Home's unless given.
// Other query parameters are kept.
// With `custom`, Custom picks a range by date: ?period=custom&from=…&to=…. A range's panels are
// the server's to draw, so picking a new one navigates; going back to the range already drawn doesn't.
export function PeriodScope({ periods = PAGE_PERIODS.home, custom, children }: { periods?: PeriodSet; custom?: CustomScope; children: ReactNode }) {
  const params = useSearchParams();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Picking dates loads the range from the server: the bar across the top shows it.
  useTopLoading(pending);
  // Tapping Custom with no range drawn yet loads the last 30 days; until they arrive the switch and the
  // dates already show it, from this.
  const [asked, setAsked] = useOptimistic<DateRange | null>(null);
  const raw = params.get("period");
  const asking = asked !== null;
  const period: HomePeriod = custom && (raw === "custom" || asking) ? "custom" : parsePeriod(raw ?? undefined, periods);
  // The range the panels are for: the one the server drew, which moves dates in the future or the wrong way
  // round (see DatesNote), not the URL's. A range being picked shows at once, while it loads.
  const range = custom ? ((asking ? asked : null) ?? custom.range) : null;
  const search = params.toString();
  // The trips and charges lists remember their period, so the page of one links back to it.
  useEffect(() => {
    const path = window.location.pathname;
    if (!REMEMBERED_LISTS.includes(path)) return;
    try {
      sessionStorage.setItem(LIST_KEY + path, search ? `?${search}` : "");
    } catch {}
  }, [search]);

  const withRange = (url: URL, next: DateRange) => {
    url.searchParams.set("period", "custom");
    url.searchParams.set("from", next.from);
    url.searchParams.set("to", next.to);
    return url;
  };
  const pick = (next: DateRange) => {
    const url = withRange(new URL(window.location.href), next);
    startTransition(() => {
      setAsked(next);
      router.replace(`${url.pathname}${url.search}`, { scroll: false });
    });
  };
  const select = (next: HomePeriod) => {
    if (next === "custom") {
      if (!custom) return;
      // The last 30 days, today included, until another range is picked.
      const today = isoDay(custom.today)!;
      if (!custom.range) return pick({ from: dayIso(today - 29), to: custom.today });
      window.history.replaceState(null, "", withRange(new URL(window.location.href), custom.range));
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("from");
    url.searchParams.delete("to");
    if (next === defaultPeriod(periods)) url.searchParams.delete("period");
    else url.searchParams.set("period", next);
    window.history.replaceState(null, "", url);
  };
  return <PeriodContext value={{ period, periods, custom, range, pending, select, pick }}>{children}</PeriodContext>;
}

// The switch for the period of the scope it is in, offering the scope's options, and the dates when Custom
// is picked.
export function PeriodPicker() {
  const { period, periods, custom, range, pending, select, pick } = useContext(PeriodContext);
  return (
    // The range sits beside the switch where there is room, and below it on a phone.
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <PeriodSwitch period={period} options={periods.options} custom={Boolean(custom)} onChange={select} />
      {custom && period === "custom" && range && (
        // Keyed by the range, so the inputs start over from the one the page drew.
        <RangePicker key={`${range.from}:${range.to}`} range={range} today={custom.today} pending={pending} onPick={pick} />
      )}
    </div>
  );
}

const EARLIEST = "2012-01-01";

// Why a range can't be picked, in words, or null when it can. A typed date can fall outside what the
// browser's picker offers, so the check doesn't trust min and max.
export function rangeProblem({ from, to }: DateRange, today: string): string | null {
  if (isoDay(from) === null || isoDay(to) === null) return "Enter both dates.";
  if (from < EARLIEST || to < EARLIEST) return "Pick a date from 2012 on.";
  if (from > today || to > today) return "Pick dates up to today.";
  if (from > to) return "Pick a start date on or before the end date.";
  return null;
}

// Two date inputs boxed like the switch above them. A range is picked once it passes rangeProblem; until
// then the boxes are marked and a line says what to fix. The browser's own picker opens on tap, in the
// page's colour scheme.
function RangePicker({ range, today, pending, onPick }: { range: DateRange; today: string; pending: boolean; onPick: (range: DateRange) => void }) {
  const [draft, setDraft] = useState(range);
  const problem = rangeProblem(draft, today);
  const change = (which: keyof DateRange, value: string) => {
    const next = { ...draft, [which]: value };
    setDraft(next);
    if (rangeProblem(next, today) === null) onPick(next);
  };
  const field = (which: keyof DateRange, label: string, min: string, max: string) => (
    <label className={cn("inline-flex h-[calc(2rem+2px)] items-center rounded-lg border text-[0.8rem] max-sm:h-[calc(2.5rem+2px)] focus-within:outline-2 focus-within:-outline-offset-2", problem && "border-destructive", pending && "bg-muted motion-safe:animate-pulse")}>
      <span className="pl-2.5 text-muted-foreground max-sm:pl-3">{label}</span>
      <input
        type="date"
        value={draft[which]}
        min={min}
        max={max}
        required
        aria-invalid={problem !== null}
        aria-describedby={problem ? "range-problem" : undefined}
        onChange={(e) => change(which, e.target.value)}
        className="h-full bg-transparent px-2 font-mono tabular-nums text-foreground outline-none max-sm:px-3 max-sm:text-[max(16px,0.8rem)]"
      />
    </label>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      {field("from", "From", EARLIEST, draft.to || today)}
      {field("to", "To", draft.from || EARLIEST, today)}
      {/* While the range loads the boxes shimmer; the words are for screen readers only, so nothing moves. */}
      <span role="status" className="sr-only">
        {pending ? "Loading the range…" : ""}
      </span>
      {problem && (
        <p id="range-problem" className="w-full text-xs text-destructive">
          {pickerLine(problem, range, today)}
        </p>
      )}
    </div>
  );
}
