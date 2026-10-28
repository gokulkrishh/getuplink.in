"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { usePeriod } from "@/components/stats/period-scope";
import { statsHref, type View } from "@/components/stats/periods";
import { moreLinkClass } from "@/components/more-link";

// A link to a Stats page with the period picked here (Custom with its dates) rather than the one the page opened with. Every copy
// of a steady panel (see ByPeriod) then points at the same page, so only that one is prefetched.
export function PeriodLink({ view, className, children }: { view: View; className?: string; children: ReactNode }) {
  const { period, range } = usePeriod();
  return (
    <Link href={statsHref(view, period, range)} prefetch={true} className={className}>
      {children}
    </Link>
  );
}

// A home section's way to its Stats page: a ghost button beside the title.
export function MoreLink({ view, children }: { view: View; children: string }) {
  return (
    <PeriodLink view={view} className={moreLinkClass}>
      {children}
      <ChevronRight aria-hidden="true" />
    </PeriodLink>
  );
}
