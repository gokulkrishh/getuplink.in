import Link from "next/link";
import { cn } from "@/lib/utils";
import { type Period, statsHref, type View, VIEWS } from "./periods";

// One topic at a time, so Battery and Updates aren't a long scroll below charging. The period carries over.
export function ViewTabs({ view, period }: { view: View; period: Period }) {
  return (
    <nav aria-label="Stats sections" className="flex gap-6 border-b text-sm">
      {VIEWS.map(({ value, label }) => (
        <Link
          key={value}
          href={statsHref(value, period)}
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
