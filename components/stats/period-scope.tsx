"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { Period } from "@/lib/periods";
import { PeriodSwitch } from "./period-switch";

type Scope = { period: Period; select: (period: Period) => void };

export const PeriodContext = createContext<Scope>({ period: "month", select: () => {} });

export const usePeriod = () => useContext(PeriodContext).period;

// A section that depends on the period, rendered by the server for each one; shows the one picked.
export function ByPeriod({ panels }: { panels: Partial<Record<Period, ReactNode>> }) {
  return panels[usePeriod()] ?? null;
}

// Holds a page's period. Every period's panels arrive with the page, so switching needs no server trip:
// only ?period= in the address bar changes (Month, the default, stays out), and a shared link opens the
// same view. Other query parameters are kept.
export function PeriodScope({ initial, children }: { initial: Period; children: ReactNode }) {
  const [period, setPeriod] = useState(initial);
  const select = (next: Period) => {
    setPeriod(next);
    const url = new URL(window.location.href);
    if (next === "month") url.searchParams.delete("period");
    else url.searchParams.set("period", next);
    window.history.replaceState(null, "", url);
  };
  return <PeriodContext value={{ period, select }}>{children}</PeriodContext>;
}

// The switch for the period of the scope it is in. `options` limits it, like Updates without Week.
export function PeriodPicker({ options }: { options?: Period[] }) {
  const { period, select } = useContext(PeriodContext);
  return <PeriodSwitch period={period} options={options} onChange={select} />;
}
