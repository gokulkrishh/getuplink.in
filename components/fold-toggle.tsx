import { ChevronDown } from "lucide-react";

// The right side of a <details> summary: "Show" with a chevron that turns when open, in the colour of a
// control, so the row reads as something to click. The <details> needs the `group` class.
export function FoldToggle() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-foreground">
      <span className="group-open:hidden">Show</span>
      <span className="hidden group-open:inline">Hide</span>
      <ChevronDown className="size-4 transition-transform duration-150 group-open:rotate-180" aria-hidden="true" />
    </span>
  );
}
