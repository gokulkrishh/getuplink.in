import Link from "next/link";
import { DEMO_SCENARIOS, type DemoScenario } from "@/lib/demo";

// Local demo mode only: switches the car between the states a page can be in. `path` is the page's own.
export function DemoBar({ active, path = "/" }: { active: DemoScenario; path?: string }) {
  return (
    <nav aria-label="Demo scenarios" className="mb-12 flex flex-wrap gap-x-4 gap-y-1 border-y py-3 text-xs text-muted-foreground">
      <span className="text-faint">Demo</span>
      {Object.entries(DEMO_SCENARIOS).map(([key, label]) => (
        <Link key={key} href={`${path}?demo=${key}`} aria-current={key === active ? "page" : undefined} className={key === active ? "text-foreground" : "hover:text-foreground"}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
