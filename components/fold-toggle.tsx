import { ChevronDown } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The right side of a fold's row: "Show" with a chevron that turns when open, drawn as a small ghost button.
// It stays a span, drawn only: the row's trigger is what's clicked, and its aria-expanded says open or
// closed, so a screen reader skips these words. Its fill, words and chevron follow its own trigger only (the
// nearest [data-panel-open], hover where something can hover, a press on a tap), never a fold around it, so
// a fold inside another (Settings' Connect your AI) doesn't light up or flip the outer one. Outside a
// trigger (Fold, or a row that also holds a Copy button), pass `open`. Section folds use Fold, which draws it.
export function FoldToggle({ open, className }: { open?: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-panel-open={open || undefined}
      className={cn(
        buttonVariants({ variant: "ghost", size: "sm" }),
        "pointer-events-none shrink-0 text-foreground [@media(hover:hover)]:in-[[data-slot=collapsible-trigger]:hover]:bg-accent in-[[data-slot=collapsible-trigger]:active]:bg-accent",
        className,
      )}
    >
      <span className="in-data-panel-open:hidden">Show</span>
      <span className="hidden in-data-panel-open:inline">Hide</span>
      <ChevronDown className="size-4 transition-transform duration-150 motion-reduce:transition-none in-data-panel-open:rotate-180" />
    </span>
  );
}
