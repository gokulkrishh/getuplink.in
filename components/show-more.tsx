"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

// Hides `children` behind a right-aligned "Show N more" that stays below them once opened.
export function ShowMore({ count, children }: { count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && children}
      <div className="flex justify-end pt-2">
        <Button type="button" variant="ghost" size="xs" className="-mr-2" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Show less" : `Show ${count} more`}
        </Button>
      </div>
    </>
  );
}
