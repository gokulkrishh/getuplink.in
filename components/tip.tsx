"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// A small label above an icon button, shown on hover or keyboard focus, or when its TipTrigger is tapped.
// The parent needs `group relative` (TipTrigger has both). It sits out of flow, so showing it never moves
// anything; the trigger still needs its own accessible text, since this is hidden from screen readers.
export function Tip({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute right-0 bottom-full z-10 mb-1.5 bg-foreground px-2 py-1 text-xs font-normal whitespace-nowrap text-background opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[open=true]:opacity-100"
    >
      {children}
    </span>
  );
}

// A focusable text label whose tip also opens on tap (touch has no hover) and closes when focus leaves.
// The hit area grows to 32px tall without moving the text.
export function TipTrigger({ className, children }: { className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      tabIndex={0}
      data-open={open}
      onClick={() => setOpen((v) => !v)}
      onBlur={() => setOpen(false)}
      className={cn("group relative after:absolute after:-inset-y-1.5 after:inset-x-0", className)}
    >
      {children}
    </span>
  );
}
