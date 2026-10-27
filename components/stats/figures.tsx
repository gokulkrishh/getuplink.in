import type { ReactNode } from "react";
import { InfoButton } from "@/components/info-button";
import { hasWords } from "@/lib/unit-words";
import { fitFont, Measure } from "@/components/measure";
import { cn } from "@/lib/utils";

// A value is big, and shrinks only as the row's longest needs to fit its tile (fitFont); one that isn't text
// (a name in words) scales with the tile instead.
const VALUE = "font-mono leading-none font-medium tracking-tight whitespace-nowrap tabular-nums";

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
// `terms` and `info` add an ⓘ in the top-right corner that opens the glossary words for the tiles' units
// and any method notes (see docs/charts.md); `label` names the group for screen readers. Tiles inside a
// ChartCard's `summary` put their terms on the card's ⓘ instead, so a card has one.
export function Figures({
  figures,
  terms,
  info,
  label = "these figures",
  className,
}: {
  figures: (Figure | null | false)[];
  terms?: (string | undefined)[];
  info?: ReactNode;
  label?: string;
  className?: string;
}) {
  const shown = figures.filter((f): f is Figure => Boolean(f));
  if (shown.length === 0) return null;
  // One size for the row's text values: each tile shrinks to what the longest needs (fitFont).
  const rowFont = fitFont(shown.flatMap((f) => (typeof f.value === "string" || typeof f.value === "number") && f.value !== "—" ? [String(f.value)] : []));
  const columns = shown.length <= 4 ? shown.length : 3;
  const left = shown.length % columns;
  const button = Boolean(info) || hasWords(terms);
  // A lone tile stays tile-sized (half the width) instead of stretching across the page. With an ⓘ, the
  // wrapper takes that width instead, so the ⓘ stays in the tile's corner rather than the page's.
  const lone = shown.length === 1 && "sm:w-1/2";
  const grid = (
    <dl className={cn("grid grid-cols-2 gap-px border bg-border bg-clip-padding dark:border-transparent dark:bg-background", SM_COLUMNS[columns], !button && lone, className)}>
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
          <dt className={cn("flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground", button && k < Math.max(columns, 2) && "pr-6")}>
            {f.key}
            {f.label}
          </dt>
          {/* "—": nothing happened (no drive, no charge), drawn faint so it doesn't read as a figure. */}
          {f.value === "—" ? (
            <dd className={cn(VALUE, "text-faint")}>—</dd>
          ) : typeof f.value === "string" || typeof f.value === "number" ? (
            <dd className={VALUE} style={rowFont}>
              <Measure text={String(f.value)} size="tile" />
            </dd>
          ) : (
            <dd className={cn(VALUE, "text-[clamp(1rem,13cqi,1.75rem)]")}>{f.value}</dd>
          )}
          {f.extra && <dd>{f.extra}</dd>}
          {f.note && <dd className="text-xs leading-5 text-muted-foreground tabular-nums">{f.note}</dd>}
        </div>
      ))}
    </dl>
  );
  if (!button) return grid;
  return (
    <div className={cn("relative", lone)}>
      {grid}
      <InfoButton label={label} terms={terms} className="absolute top-2 right-2 sm:top-3 sm:right-3">
        {info}
      </InfoButton>
    </div>
  );
}
