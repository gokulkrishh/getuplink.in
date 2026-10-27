"use client";

import Link from "next/link";
import { type ReactNode, startTransition, useId, useOptimistic, ViewTransition } from "react";
import { cn } from "@/lib/utils";

// `dot`: something new behind this tab, marked with a small dot after its label.
type Option<T> = { value: T; label: string; icon?: ReactNode; dot?: boolean };

// The label in one grid cell with an invisible medium-weight copy of itself, so the cell is always as
// wide as the picked label and going medium doesn't move the neighbours. `phoneHidden` keeps the label
// for screen readers only on phones (both copies, so the reserved width goes too).
function Label({ label, phoneHidden = false }: { label: string; phoneHidden?: boolean }) {
  return (
    <span className={cn("grid justify-items-center", phoneHidden && "sr-only sm:not-sr-only")}>
      <span className="[grid-area:1/1]">{label}</span>
      <span aria-hidden="true" data-label-reserve="" className="invisible font-medium [grid-area:1/1]">
        {label}
      </span>
    </span>
  );
}

// The picked option's highlight, behind the label (the tab isolates, so -z-10 stays inside it). One element
// per strip holds `name`; when the pick changes inside a Transition, React pairs the old and new copies and
// the browser slides it across (`.tab-indicator` in globals.css). `default="none"` keeps it still on every
// other transition.
function Indicator({ name, className }: { name: string; className: string }) {
  return (
    <ViewTransition name={name} share="tab-indicator" default="none">
      <span aria-hidden="true" className={cn("absolute -z-10", className)} />
    </ViewTransition>
  );
}

// A boxed row of options with one picked, like the period switch. Colour and weight change at once, with
// no CSS transition, so the highlight is the only thing that moves. `role` keeps each strip's semantics:
// "pressed" is a group of toggle buttons, "radio" a radiogroup. The highlight's name is this strip's own
// (useId), so the same strip on another page, or on a page Next keeps hidden, never pairs with it.
export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  role = "pressed",
  size = "sm",
  phoneLabels = true,
}: {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  role?: "pressed" | "radio";
  size?: "sm" | "md";
  phoneLabels?: boolean;
}) {
  const indicator = `tab-indicator-${useId().replace(/[^\w-]/g, "")}`;
  // The strip itself is lifted above the sliding highlight while it moves (`.tab-labels` in globals.css):
  // without it the highlight, drawn over the page, would hide each label it passes.
  return (
    <ViewTransition update="tab-labels" default="none">
      <div role={role === "radio" ? "radiogroup" : "group"} aria-label={label} className="inline-flex max-w-full overflow-x-auto border [scrollbar-width:none]">
        {options.map((option) => {
          const picked = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role={role === "radio" ? "radio" : undefined}
              aria-checked={role === "radio" ? picked : undefined}
              aria-pressed={role === "pressed" ? picked : undefined}
              onClick={() => startTransition(() => onChange(option.value))}
              className={cn(
                "tap-target isolate inline-flex items-center justify-center whitespace-nowrap outline-none select-none focus-visible:outline-2 focus-visible:-outline-offset-2",
                size === "sm" ? "h-7 gap-1 px-2.5 text-[0.8rem] max-sm:h-9 max-sm:px-2" : "gap-1.5 px-3 py-1.5 text-sm max-sm:py-2.5",
                picked ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {picked && <Indicator name={indicator} className="inset-0 bg-secondary" />}
              {option.icon}
              <Label label={option.label} phoneHidden={!phoneLabels} />
            </button>
          );
        })}
      </div>
    </ViewTransition>
  );
}

// Underlined links between pages, like the Stats sections. The picked one goes medium as soon as it's
// clicked (optimistic), while the underline follows the page that actually commits: its `name` is the
// same on every page that shows these links, so it slides across when the next page renders in the same
// navigation (a prefetched page; one still loading shows its skeleton and the underline just appears).
export function TabLinks<T extends string>({
  name,
  label,
  options,
  value,
}: {
  name: string;
  label: string;
  options: (Option<T> & { href: string })[];
  value: T;
}) {
  const [shown, setShown] = useOptimistic(value);
  return (
    <nav aria-label={label} className="flex gap-6 border-b text-sm">
      {options.map((option) => (
        <Link
          key={option.value}
          href={option.href}
          prefetch={true}
          scroll={false}
          aria-current={shown === option.value ? "page" : undefined}
          onNavigate={() => startTransition(() => setShown(option.value))}
          className={cn(
            "relative isolate -mb-px border-b border-transparent py-2",
            shown === option.value ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Label label={option.label} />
          {option.dot && <span className="absolute top-1.5 -right-2 size-1.5 rounded-full bg-chart-accent" aria-label="New" />}
          {value === option.value && <Indicator name={name} className="inset-x-0 -bottom-px h-px bg-foreground" />}
        </Link>
      ))}
    </nav>
  );
}
