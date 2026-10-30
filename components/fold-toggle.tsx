import { ChevronDown } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The right side of a <details> summary: "Show" with a chevron that turns when open, drawn as a small ghost
// button. It stays a span: the whole summary row is what's clicked, and a <button> can't sit inside one. So
// its fill comes on when the row is hovered, and -mr-2.5 keeps its words where they sat before it had one.
// The <details> needs the `group` class.
export function FoldToggle() {
  return (
    <span className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "pointer-events-none -mr-2.5 shrink-0 text-foreground group-hover:bg-accent")}>
      <span className="group-open:hidden">Show</span>
      <span className="hidden group-open:inline">Hide</span>
      <ChevronDown className="size-4 transition-transform duration-150 group-open:rotate-180" aria-hidden="true" />
    </span>
  );
}
