"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

// Hides `children` behind a right-aligned "Show N more" that stays below them once opened.
export function ShowMore({ count, children }: { count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && children}
      <ShowMoreButton count={count} open={open} onToggle={() => setOpen(!open)} />
    </>
  );
}

// The button alone, for a list that keeps its hidden rows in the same table (see TripRows).
export function ShowMoreButton({ count, open, onToggle }: { count: number; open: boolean; onToggle: () => void }) {
  return (
    <div className="flex justify-end pt-2">
      <Button type="button" variant="ghost" size="xs" className="-mr-2" aria-expanded={open} onClick={onToggle}>
        {open ? "Show less" : `Show ${count} more`}
      </Button>
    </div>
  );
}
