"use client";

import { DashRing } from "@/components/loading-ui/dash-ring";
import { RotateCw } from "lucide-react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

// Must render inside the <form action={checkNow}> it submits.
// Both labels share one grid cell, so swapping them never changes the button's width.
export function CheckNowButton({ className, spinner = false }: { className?: string; spinner?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={cn("inline-flex cursor-pointer items-center gap-1.5 disabled:cursor-progress", className)}
    >
      {spinner && pending && <DashRing className="size-3.5" aria-hidden="true" />}
      <span className="grid">
        <span className={cn("col-start-1 row-start-1", pending && "invisible")}>Check now</span>
        <span className={cn("col-start-1 row-start-1", !pending && "invisible")} aria-hidden={!pending}>
          Checking…
        </span>
      </span>
    </button>
  );
}

// Icon-only version, placed next to "Seen …". Spins while the check runs.
export function CheckNowIcon({ className }: { className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      aria-label={pending ? "Checking…" : "Check now"}
      className={cn(
        "group relative inline-flex size-6 cursor-pointer items-center justify-center text-faint transition-colors duration-150 hover:text-foreground disabled:cursor-progress disabled:text-foreground",
        className,
      )}
    >
      <RotateCw className={cn("size-3.5", pending && "motion-safe:animate-spin")} aria-hidden="true" />
      {/* Tooltip: positioned out of flow, so showing it never moves anything. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-full left-1/2 z-10 mt-1.5 -translate-x-1/2 bg-foreground px-2 py-1 text-xs whitespace-nowrap text-background opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {pending ? "Checking…" : "Check now"}
      </span>
    </button>
  );
}
