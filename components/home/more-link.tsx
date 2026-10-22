"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePeriod } from "@/components/stats/period-scope";
import { statsHref, type View } from "@/components/stats/periods";

// A home section's way to its Stats page, with the period picked here rather than the one the page opened with.
export function MoreLink({ view, children }: { view: View; children: string }) {
  const period = usePeriod();
  return (
    <Link href={statsHref(view, period)} prefetch={true} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
      {children}
      <ChevronRight className="size-3" aria-hidden="true" />
    </Link>
  );
}
