import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

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
