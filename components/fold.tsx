"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type ComponentProps, type ReactNode } from "react";
import { FoldToggle } from "@/components/fold-toggle";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

const TITLE: Record<"h2" | "h3" | "span", string> = {
  h2: "text-lg font-medium tracking-heading",
  h3: "text-base font-medium tracking-heading",
  span: "",
};

// A section that opens and closes under its heading row: the title, a line under it, and Show (or a bare
// chevron) on the right, closed at first. Every such fold in the app is this one: Your charging habits,
// Battery's More detail, Adoption over time, Settings' Connect your AI, a `shut` or `fold` ChartCard.
//
// The heading stays a heading, and the trigger is a real <button> inside it holding only the title, so a
// screen reader hears "Your charging habits, button, collapsed" (with the line as its description), not the
// whole row read as one button. The button's ::after stretches over the row, so the row is still what's
// clicked, and its focus ring draws round the row. The line and Show sit under that layer, out of the tab
// order: Show is drawn only (FoldToggle), the button's aria-expanded says the state.
//
// Show's fill follows this row's hover and press (a named group), and its words follow this fold's own state,
// so a fold inside another (Settings' Manual instructions) never lights up or flips the outer one. Closed,
// the content stays in the page but hidden (see CollapsibleContent): it takes no space and nothing in it can
// be tabbed to, and find-in-page still opens it. Since it stays in the page, the button's aria-controls
// names it open or closed (Base UI sets it only while open).
export function Fold({
  title,
  description,
  as: Heading = "h2",
  toggle = "show",
  defaultOpen = false,
  className,
  rowClassName,
  headClassName = "space-y-1",
  titleClassName,
  contentClassName,
  children,
  ...props
}: {
  // "Your charging habits": the button's name.
  title: ReactNode;
  // One line under the title, read as the button's description.
  description?: ReactNode;
  // The title's element: h2 for a page section, h3 under one, span for a plain row label (a `shut` chart).
  as?: "h2" | "h3" | "span";
  // "show": the Show/Hide ghost button. "chevron": a bare chevron (Owners' rows of charts).
  toggle?: "show" | "chevron";
  defaultOpen?: boolean;
  // The fold itself (margins, borders).
  className?: string;
  // The heading row: padding, alignment and text size.
  rowClassName?: string;
  // The block holding the title and line.
  headClassName?: string;
  titleClassName?: string;
  // The opened part's spacing.
  contentClassName?: string;
  children?: ReactNode;
} & Omit<ComponentProps<typeof Collapsible>, "children" | "className" | "open" | "defaultOpen" | "onOpenChange" | "title">) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const lineId = `${id}-line`;
  const panelId = `${id}-panel`;
  return (
    <Collapsible open={open} onOpenChange={setOpen} className={className} {...props}>
      <div className={cn("group/fold-row relative flex w-full justify-between gap-4", toggle === "chevron" ? "items-start" : "items-center", rowClassName)}>
        <div className={cn("min-w-0", headClassName)}>
          <Heading className={cn(TITLE[Heading], Heading === "span" && "block", titleClassName)}>
            <CollapsibleTrigger
              aria-controls={panelId}
              aria-describedby={description ? lineId : undefined}
              className="block w-full cursor-pointer text-left outline-none after:absolute after:inset-0 after:rounded-md focus-visible:after:ring-2 focus-visible:after:ring-ring/50"
            >
              {title}
            </CollapsibleTrigger>
          </Heading>
          {description && (
            <p id={lineId} className="text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {toggle === "show" ? (
          <FoldToggle open={open} className="[@media(hover:hover)]:group-hover/fold-row:bg-accent group-active/fold-row:bg-accent" />
        ) : (
          <ChevronDown
            className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none", open && "rotate-180")}
            aria-hidden="true"
          />
        )}
      </div>
      <CollapsibleContent id={panelId} className={contentClassName}>{children}</CollapsibleContent>
    </Collapsible>
  );
}
