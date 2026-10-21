"use client";

import { DashRing } from "@/components/loading-ui/dash-ring";
import { RotateCw } from "lucide-react";
import { Tip } from "@/components/tip";
import { Button } from "@/components/ui/button";
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
        <span className={cn("col-start-1 row-start-1", pending && "invisible")}>Refresh</span>
        <span className={cn("col-start-1 row-start-1", !pending && "invisible")} aria-hidden={!pending}>
          Refreshing…
        </span>
      </span>
    </button>
  );
}

// Icon-only version, placed next to "Seen …". Spins while the check runs.
export function CheckNowIcon({ className }: { className?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="ghost"
      size="icon-xs"
      disabled={pending}
      aria-busy={pending}
      aria-label={pending ? "Refreshing…" : "Refresh"}
      className={cn("group relative text-faint disabled:text-foreground disabled:opacity-100", className)}
    >
      <RotateCw className={cn("size-3.5", pending && "motion-safe:animate-spin")} aria-hidden="true" />
      {/* A check can only read a car that's awake; asleep, Tesla returns nothing new. */}
      <Tip>{pending ? "Refreshing…" : "Open the Tesla app first so your car is awake."}</Tip>
    </Button>
  );
}
