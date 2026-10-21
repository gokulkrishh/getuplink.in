"use client";

import { useState, type ReactNode } from "react";

// Hides `children` behind a right-aligned "Show N more" that stays below them once opened.
export function ShowMore({ count, children }: { count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && children}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="ml-auto block cursor-pointer pt-3 text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground"
      >
        {open ? "Show less" : `Show ${count} more`}
      </button>
    </>
  );
}
