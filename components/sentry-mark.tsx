"use client";

import { Tip, TipTrigger } from "@/components/tip";
import { cn } from "@/lib/utils";

// Sentry Mode watching, as a red circle beside the car's state. Hover or tap says so. The circle is the
// only thing on the button, so the label is the same sentence.
export function SentryMark({ align = "start", className }: { align?: "start" | "end"; className?: string }) {
  return (
    <TipTrigger label="Sentry Mode is on." className={cn("inline-flex align-[-0.15em]", className)}>
      <span className="inline-flex size-4 items-center justify-center rounded-full border-2 border-faint" aria-hidden="true">
        <span className="size-2 rounded-full bg-destructive" />
      </span>
      <Tip align={align}>Sentry Mode is on.</Tip>
    </TipTrigger>
  );
}
