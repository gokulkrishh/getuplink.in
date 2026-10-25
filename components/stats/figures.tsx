import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// `note` is a line of context under the value ("Usually 0.8% a day"), `extra` anything drawn below it
// (a level bar). `key` is an optional swatch before the label, like a chart legend.
export type Figure = { label: string; value: ReactNode; note?: ReactNode; extra?: ReactNode; key?: ReactNode };

// A value set like the home headline's: numbers in mono, the words and % after them ("h", "kWh", "mV",
// "/kWh") small and faint. Signs before a number ("≈", "≥", "₹") stay full size.
function Measure({ text }: { text: string }) {
  return text
    .split(/(\d[\d.,]*)/)
    .filter((part) => part.trim())
    .map((part, k) =>
      /[\p{L}%]/u.test(part) ? (
        <span key={k} className="mr-1.5 ml-1 text-xs font-normal tracking-normal text-faint last:mr-0">
          {part.trim()}
        </span>
      ) : (
        <Fragment key={k}>{part}</Fragment>
      ),
    );
}

const SM_COLUMNS = ["", "sm:grid-cols-1", "sm:grid-cols-2", "sm:grid-cols-3", "sm:grid-cols-4"];
const SM_SPAN = ["", "", "sm:col-span-2", "sm:col-span-3"];

// A few related numbers as tiles, like the home headline strip: a bordered grid, an uppercase label, the
// value large with its unit small, and a line of context under it. Two columns on a phone; wider, one row
// of up to four, and rows of three past that. No cell is left empty: on a phone an odd first tile takes
// the whole row, and wider the last tile fills out its row.
export function Figures({ figures, className }: { figures: (Figure | null | false)[]; className?: string }) {
  const shown = figures.filter((f): f is Figure => Boolean(f));
  if (shown.length === 0) return null;
  const columns = shown.length <= 4 ? shown.length : 3;
  const left = shown.length % columns;
  return (
    <dl className={cn("grid grid-cols-2 gap-px border bg-border bg-clip-padding", SM_COLUMNS[columns], className)}>
      {shown.map((f, k) => (
        <div
          key={f.label}
          className={cn(
            "@container flex min-w-0 flex-col gap-2 bg-background p-3 sm:p-4",
            k === 0 && shown.length % 2 === 1 && "max-sm:col-span-2",
            k === shown.length - 1 && left > 0 && SM_SPAN[columns - left + 1],
          )}
        >
          {/* A long label ("Hardest acceleration") wraps rather than cutting off on a phone. */}
          <dt className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-faint uppercase">
            {f.key}
            {f.label}
          </dt>
          <dd className="font-mono text-[clamp(1rem,13cqi,1.75rem)] leading-none font-medium tracking-tight whitespace-nowrap tabular-nums">
            {typeof f.value === "string" || typeof f.value === "number" ? <Measure text={String(f.value)} /> : f.value}
          </dd>
          {f.extra && <dd>{f.extra}</dd>}
          {f.note && <dd className="text-xs leading-5 text-muted-foreground tabular-nums">{f.note}</dd>}
        </div>
      ))}
    </dl>
  );
}
