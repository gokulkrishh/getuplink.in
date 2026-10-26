import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// A link that covers its whole row (the row is `relative`). Its own outline would only ring the text, so
// keyboard focus rings the row instead.
export const ROW_LINK = "outline-none after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring";

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
