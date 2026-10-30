import { Car, ChevronRight, Zap } from "lucide-react";
import Link from "next/link";
import type { RecentItem } from "@/lib/recently";
import { cn } from "@/lib/utils";

const ICONS = { drive: Car, charge: Zap };
const LABELS = { drive: "Recent drive", charge: "Recent charge" };

// What a screen reader hears for the link: "Recent drive, 18.4 km, 8:30 AM to 8:52 AM".
const spoken = (item: RecentItem) => [LABELS[item.kind], item.figure, item.when].filter(Boolean).join(", ");

// A figure with its units quiet: "18.4" large and "km" small; "50%" and "80%" large, "to" small.
function Figure({ text }: { text: string }) {
  return text.split(/ (km|kWh|to) ?/).map((part, k) =>
    k % 2 === 1 ? (
      <span key={k} className="mx-1 text-xs font-normal tracking-normal text-faint">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

// The recent drive and charge as cards in the week tiles' frame: what it was, how much (large), when
// (small), each opening its page. One card keeps a card's width (half the row from sm up, under two of the
// week tiles) rather than stretch across the page.
// Nothing when neither is recent.
export function Recently({ items }: { items: RecentItem[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="recent-title" className="space-y-3">
      <h2 id="recent-title" className="text-lg font-medium tracking-heading">
        Last 24 hours
      </h2>
      <ul className={cn("grid gap-px overflow-hidden rounded-lg border bg-border bg-clip-padding dark:border-transparent dark:bg-background", items.length > 1 ? "grid-cols-2" : "sm:w-1/2")}>
        {items.map((item) => {
          const Icon = ICONS[item.kind];
          return (
            <li key={item.href} className="flex">
              <Link
                href={item.href}
                prefetch={true}
                aria-label={spoken(item)}
                className="group flex min-w-0 flex-1 flex-col gap-2 bg-background p-3 transition-colors duration-150 hover:bg-muted focus-visible:z-10 focus-visible:outline-offset-[-2px] sm:p-4 dark:bg-card"
              >
                <span className="flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
                  <Icon aria-hidden="true" className="size-3.5 shrink-0" />
                  <span className="truncate">{LABELS[item.kind]}</span>
                  <ChevronRight aria-hidden="true" className="ml-auto size-3.5 shrink-0 transition-[color,translate] duration-150 group-hover:translate-x-0.5 group-hover:text-foreground" />
                </span>
                {item.figure ? (
                  <>
                    <span className="font-mono text-xl leading-none font-medium tracking-tight whitespace-nowrap tabular-nums">
                      <Figure text={item.figure} />
                    </span>
                    <span className="text-xs leading-5 text-muted-foreground tabular-nums">{item.when}</span>
                  </>
                ) : (
                  <span className="text-sm leading-5 tabular-nums">{item.when}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
