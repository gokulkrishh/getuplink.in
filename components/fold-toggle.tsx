import { ChevronDown } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The right side of a Collapsible's trigger row: "Show" with a chevron that turns when open, drawn as a small
// ghost button. It stays a span: the whole row is what's clicked, and a button can't sit inside another. Its
// fill, words and chevron follow its own trigger only (the nearest [data-panel-open], hover where something
// can hover, a press on a tap), never a fold around it, so a fold inside another (Settings' Advanced) doesn't
// light up or flip the outer one. Outside a trigger (a row that also holds a Copy button), pass `open`.
export function FoldToggle({ open, className }: { open?: boolean; className?: string }) {
  return (
    <span
      data-panel-open={open || undefined}
      className={cn(
        buttonVariants({ variant: "ghost", size: "sm" }),
        "pointer-events-none shrink-0 text-foreground [@media(hover:hover)]:in-[[data-slot=collapsible-trigger]:hover]:bg-accent in-[[data-slot=collapsible-trigger]:active]:bg-accent",
        className,
      )}
    >
      <span className="in-data-panel-open:hidden">Show</span>
      <span className="hidden in-data-panel-open:inline">Hide</span>
      <ChevronDown className="size-4 transition-transform duration-150 in-data-panel-open:rotate-180" aria-hidden="true" />
    </span>
  );
}
