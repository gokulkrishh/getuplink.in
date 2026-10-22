"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { usePeriod } from "./period-scope";
import { statsHref, type View, VIEWS } from "./periods";

// One page per topic, with the period carried over: the one picked on this page, not the one it opened with.
export function ViewTabs({ view }: { view: View }) {
  const period = usePeriod();
  return (
    <nav aria-label="Stats sections" className="flex gap-6 border-b text-sm">
      {VIEWS.map(({ value, label }) => (
        <Link
          key={value}
          href={statsHref(value, period)}
          prefetch={true}
          scroll={false}
          aria-current={view === value ? "page" : undefined}
          className={cn(
            "-mb-px border-b py-2 transition-colors duration-150",
            view === value ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
