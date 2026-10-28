"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// A small label above an icon button, shown on hover or keyboard focus, or when its TipTrigger is tapped.
// The parent needs `group relative` (TipTrigger has both). It sits out of flow, so showing it never moves
// anything; the trigger still needs its own accessible text, since this is hidden from screen readers.
// It grows away from the trigger's `end` edge by default; pass `start` for triggers near the left of the
// page, or `className` for alignment that changes by breakpoint. It wraps rather than leave a phone screen.
export function Tip({ align = "end", className, children }: { align?: "start" | "end"; className?: string; children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute bottom-full z-10 mb-1.5 w-max max-w-[calc(100vw-2rem)] bg-foreground px-2 py-1 text-xs font-normal text-background opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[open=true]:opacity-100",
        align === "start" ? "left-0" : "right-0",
        className,
      )}
    >
      {children}
    </span>
  );
}

// A focusable text label whose tip also opens on tap (touch has no hover) and closes when focus leaves.
// The hit area grows to 32px tall without moving the text.
export function TipTrigger({ className, label, children }: { className?: string; label?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      data-open={open}
      onClick={() => setOpen((v) => !v)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      className={cn("group relative text-left after:absolute after:-inset-y-1.5 after:inset-x-0 max-sm:after:-inset-y-2.5", className)}
    >
      {children}
    </button>
  );
}
