import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// The link that opens a row's page. A click anywhere else in the row opens it too (see RowLinks), so the
// row's text stays selectable. It underlines while the row is hovered. Its own outline would only ring the text, so keyboard focus rings the row
// (`relative`) instead. The vertical padding (an inline link's doesn't move the line) lifts its own hit area
// to 24px or more.
export const ROW_LINK = "row-link py-1 outline-none decoration-muted-foreground underline-offset-4 group-hover/row:underline focus-visible:after:absolute focus-visible:after:inset-0 focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring";

// The arrow at the end of a row that opens a page, as on the home tiles: muted, brighter when the row
// (`group/row`, named so tips inside the row don't open with it) is hovered or focused.
export function RowChevron({ className }: { className?: string }) {
  return (
    <ChevronRight
      aria-hidden="true"
      className={cn(
        "size-3.5 shrink-0 text-muted-foreground transition-[color,translate] duration-150 group-hover/row:translate-x-0.5 group-hover/row:text-foreground group-focus-within/row:text-foreground",
        className,
      )}
    />
  );
}
