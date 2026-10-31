"use client";

import type { ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCanHover } from "@/components/use-can-hover";
import { cn } from "@/lib/utils";

// A text label with a small tip above it ("Already installed when Uplink first saw your car on …"): shadcn's
// Popover, opened on hover with a mouse and by a tap on a phone. Not shadcn's Tooltip: Base UI's tooltips
// never open on touch, and these say something a phone owner needs too. It looks like a tooltip. The trigger
// still needs its own accessible text (an sr-only copy of the tip, or `label` when it shows only an icon).
// The hit area grows to 32px tall without moving the text.
export function TipTrigger({ tip, label, align = "end", className, children }: { tip: ReactNode; label?: string; align?: "start" | "end"; className?: string; children: ReactNode }) {
  const hover = useCanHover();
  return (
    <Popover>
      <PopoverTrigger
        openOnHover={hover}
        delay={100}
        aria-label={label}
        // Its own tap and key press stop here, so a tip inside a row that opens (a version's history row) never
        // opens or closes that row too.
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        className={cn("relative cursor-default text-left after:absolute after:-inset-y-1.5 after:inset-x-0 max-sm:after:-inset-y-2.5", className)}
      >
        {children}
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align={align}
        sideOffset={6}
        collisionPadding={16}
        initialFocus={false}
        finalFocus={false}
        aria-hidden="true"
        className="w-max max-w-[calc(100vw-2rem)] gap-0 rounded-md bg-foreground px-3 py-1.5 text-xs text-background shadow-none ring-0"
      >
        {tip}
      </PopoverContent>
    </Popover>
  );
}
