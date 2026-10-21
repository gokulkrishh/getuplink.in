"use client";

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
      {spinner && pending && <RotateCw className="size-3.5 animate-spin" aria-hidden="true" />}
      <span className="grid">
        <span className={cn("col-start-1 row-start-1", pending && "invisible")}>Check now</span>
        <span className={cn("col-start-1 row-start-1", !pending && "invisible")} aria-hidden={!pending}>
          Checking…
        </span>
      </span>
    </button>
  );
}
