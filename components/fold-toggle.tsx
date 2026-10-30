import { ChevronDown } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The right side of a <details> summary: "Show" with a chevron that turns when open, drawn as a small ghost
// button. It stays a span: the whole summary row is what's clicked, and a <button> can't sit inside one. Its
// fill, words and chevron follow its own row only (`summary:hover`, `details[open]>summary`), never a fold
// around it, so a fold inside another (Settings' Advanced) doesn't light up or flip the outer one. -mr-2.5
// keeps its words where they'd sit in a row with no side padding; a padded row passes mr-0.
export function FoldToggle({ className }: { className?: string }) {
  return (
    <span className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "pointer-events-none -mr-2.5 shrink-0 text-foreground [summary:hover_&]:bg-accent", className)}>
      <span className="[details[open]>summary_&]:hidden">Show</span>
      <span className="hidden [details[open]>summary_&]:inline">Hide</span>
      <ChevronDown className="size-4 transition-transform duration-150 [details[open]>summary_&]:rotate-180" aria-hidden="true" />
    </span>
  );
}
