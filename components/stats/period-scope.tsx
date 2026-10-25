"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import { dayIso, isoDay } from "@/lib/periods";
import { cn } from "@/lib/utils";
import { type CustomScope, type DateRange, defaultPeriod, type HomePeriod, type Period, parsePeriod, urlRange } from "./periods";
import { PeriodSwitch } from "./period-switch";

export type { CustomScope, DateRange };

type Scope = {
  period: HomePeriod;
  options?: Period[];
  custom?: CustomScope;
  range: DateRange | null;
  pending: boolean;
  select: (period: HomePeriod) => void;
  pick: (range: DateRange) => void;
};

const PeriodContext = createContext<Scope>({ period: defaultPeriod(), range: null, pending: false, select: () => {}, pick: () => {} });

// The period picked here and, for Custom, its dates: what links to other pages carry (see statsHref).
export const usePeriod = (): { period: HomePeriod; range: DateRange | null } => {
  const { period, range } = useContext(PeriodContext);
  return { period, range };
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
    <div className={cn("grid", pending && "opacity-50 transition-opacity")}>
      {Object.entries(panels).map(([key, panel]) => (
        <div key={key} data-period={key} inert={key !== period} className={cn("[grid-area:1/1]", key !== period && "invisible")}>
          {panel}
        </div>
      ))}
    </div>
  );
}

// Holds a page's period, read from ?period= (the default, Week where offered, stays out of it). Every period's panels
// arrive with the page, so switching only replaces the address (which Next's router follows) and needs no
// server trip; a shared link, the logo's link to / and a refresh all show the URL's period. `options`
// limits it, like Updates without Week. Other query parameters are kept.
// With `custom`, Custom picks a range by date: ?period=custom&from=…&to=…. A range's panels are
// the server's to draw, so picking a new one navigates; going back to the range already drawn doesn't.
export function PeriodScope({ options, custom, children }: { options?: Period[]; custom?: CustomScope; children: ReactNode }) {
  const params = useSearchParams();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const raw = params.get("period");
  const period: HomePeriod = custom && raw === "custom" ? "custom" : parsePeriod(raw ?? undefined, options);
  const range = custom ? (urlRange(params.get("from"), params.get("to")) ?? custom.range) : null;

  const withRange = (url: URL, next: DateRange) => {
    url.searchParams.set("period", "custom");
    url.searchParams.set("from", next.from);
    url.searchParams.set("to", next.to);
    return url;
  };
  const pick = (next: DateRange) => {
    const url = withRange(new URL(window.location.href), next);
    startTransition(() => router.replace(`${url.pathname}${url.search}`, { scroll: false }));
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
    if (next === defaultPeriod(options)) url.searchParams.delete("period");
    else url.searchParams.set("period", next);
    window.history.replaceState(null, "", url);
  };
  return <PeriodContext value={{ period, options, custom, range, pending, select, pick }}>{children}</PeriodContext>;
}

// The switch for the period of the scope it is in, offering the scope's options, and the dates when Custom
// is picked.
export function PeriodPicker() {
  const { period, options, custom, range, pending, select, pick } = useContext(PeriodContext);
  return (
    // The range sits beside the switch where there is room, and below it on a phone.
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <PeriodSwitch period={period} options={options} custom={Boolean(custom)} onChange={select} />
      {custom && period === "custom" && range && (
        // Keyed by the range, so the inputs start over from the one the page drew.
        <RangePicker key={`${range.from}:${range.to}`} range={range} today={custom.today} pending={pending} onPick={pick} />
      )}
    </div>
  );
}

const EARLIEST = "2012-01-01";

// Two date inputs boxed like the switch above them. A range is picked once both days are dates and the
// first is not after the second; the browser's own picker opens on tap, in the page's colour scheme.
function RangePicker({ range, today, pending, onPick }: { range: DateRange; today: string; pending: boolean; onPick: (range: DateRange) => void }) {
  const [draft, setDraft] = useState(range);
  const change = (which: keyof DateRange, value: string) => {
    const next = { ...draft, [which]: value };
    setDraft(next);
    if (isoDay(next.from) !== null && isoDay(next.to) !== null && next.from <= next.to) onPick(next);
  };
  const field = (which: keyof DateRange, label: string, min: string, max: string) => (
    <label className={cn("inline-flex h-7 items-center border text-[0.8rem] max-sm:h-9 focus-within:outline-2 focus-within:-outline-offset-2", pending && "bg-muted motion-safe:animate-pulse")}>
      <span className="pl-2.5 text-muted-foreground max-sm:pl-3">{label}</span>
      <input
        type="date"
        value={draft[which]}
        min={min}
        max={max}
        required
        onChange={(e) => change(which, e.target.value)}
        className="h-full bg-transparent px-2 font-mono tabular-nums outline-none max-sm:px-3"
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
    </div>
  );
}
