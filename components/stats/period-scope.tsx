"use client";

import { useSearchParams } from "next/navigation";
import { createContext, useContext, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { defaultPeriod, type Period, parsePeriod } from "./periods";
import { PeriodSwitch } from "./period-switch";

type Scope = { period: Period; options?: Period[]; select: (period: Period) => void };

const PeriodContext = createContext<Scope>({ period: defaultPeriod(), select: () => {} });

export const usePeriod = () => useContext(PeriodContext).period;

// A section that depends on the period, rendered by the server for each one; shows the one picked. With
// `steady`, every panel stays laid out in one cell and only the picked one shows, so the section keeps the
// height of its tallest period and the page below doesn't move on a switch.
export function ByPeriod({ panels, steady = false }: { panels: Partial<Record<Period, ReactNode>>; steady?: boolean }) {
  const period = usePeriod();
  if (!steady) return panels[period] ?? null;
  return (
    <div className="grid">
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
export function PeriodScope({ options, children }: { options?: Period[]; children: ReactNode }) {
  const period = parsePeriod(useSearchParams().get("period") ?? undefined, options);
  const select = (next: Period) => {
    const url = new URL(window.location.href);
    if (next === defaultPeriod(options)) url.searchParams.delete("period");
    else url.searchParams.set("period", next);
    window.history.replaceState(null, "", url);
  };
  return <PeriodContext value={{ period, options, select }}>{children}</PeriodContext>;
}

// The switch for the period of the scope it is in, offering the scope's options.
export function PeriodPicker() {
  const { period, options, select } = useContext(PeriodContext);
  return <PeriodSwitch period={period} options={options} onChange={select} />;
}
