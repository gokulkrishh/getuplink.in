"use client";

import { LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

// Must render inside the <form action={checkNow}> it submits.
export function CheckNowButton({ className }: { className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={cn("inline-flex items-center gap-1.5", className)}>
      {pending && <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />}
      {pending ? "Checking…" : "Check now"}
    </button>
  );
}
