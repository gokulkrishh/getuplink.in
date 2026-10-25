import type { ReactNode } from "react";
import { Measure } from "@/components/measure";
import { cn } from "@/lib/utils";

export { Value } from "@/components/measure";

// `note` is a line of context under the value ("Usually 0.8% a day"), `extra` anything drawn below it
// (a level bar). `key` is an optional swatch before the label, like a chart legend.
export type Figure = { label: string; value: ReactNode; note?: ReactNode; extra?: ReactNode; key?: ReactNode };

const SM_COLUMNS = ["", "sm:grid-cols-1", "sm:grid-cols-2", "sm:grid-cols-3", "sm:grid-cols-4"];
const SM_SPAN = ["", "", "sm:col-span-2", "sm:col-span-3"];

// A few related numbers as tiles, like the home headline strip: a grid split by 1px lines (on dark, tiles
// one step lighter than the ground with the ground showing between them), a sentence-case label, the
// value large with its unit small, and a line of context under it. Two columns on a phone; wider, one row
// of up to four, and rows of three past that. No cell is left empty: on a phone an odd first tile takes
// the whole row, and wider the last tile fills out its row.
export function Figures({ figures, className }: { figures: (Figure | null | false)[]; className?: string }) {
  const shown = figures.filter((f): f is Figure => Boolean(f));
  if (shown.length === 0) return null;
  const columns = shown.length <= 4 ? shown.length : 3;
  const left = shown.length % columns;
  return (
    <dl className={cn("grid grid-cols-2 gap-px border bg-border bg-clip-padding dark:border-transparent dark:bg-background", SM_COLUMNS[columns], className)}>
      {shown.map((f, k) => (
        <div
          key={f.label}
          className={cn(
            "@container flex min-w-0 flex-col gap-2 bg-background p-3 sm:p-4 dark:bg-card",
            k === 0 && shown.length % 2 === 1 && "max-sm:col-span-2",
            k === shown.length - 1 && left > 0 && SM_SPAN[columns - left + 1],
          )}
        >
          {/* A long label ("Hardest acceleration") wraps rather than cutting off on a phone. */}
          <dt className="flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
            {f.key}
            {f.label}
          </dt>
          <dd className="font-mono text-[clamp(1rem,13cqi,1.75rem)] leading-none font-medium tracking-tight whitespace-nowrap tabular-nums">
            {typeof f.value === "string" || typeof f.value === "number" ? <Measure text={String(f.value)} size="tile" /> : f.value}
          </dd>
          {f.extra && <dd>{f.extra}</dd>}
          {f.note && <dd className="text-xs leading-5 text-muted-foreground tabular-nums">{f.note}</dd>}
        </div>
      ))}
    </dl>
  );
}
