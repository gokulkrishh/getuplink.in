"use client";

import { Tip, TipTrigger } from "@/components/tip";
import { cn } from "@/lib/utils";

// Sentry Mode watching, as a red circle sized to the text beside it. Callers centre it on that text in an
// items-center row. Hover or tap says so. The circle is the
// only thing on the button, so the label is the same sentence.
export function SentryMark({ align = "start", className }: { align?: "start" | "end"; className?: string }) {
  return (
    <TipTrigger label="Sentry Mode is on." className={cn("inline-flex", className)}>
      {/* Drawn, not two nested boxes: rounding at small sizes pushed the dot off centre. */}
      <svg viewBox="0 0 16 16" className="size-[1em]" aria-hidden="true">
        <circle cx="8" cy="8" r="6.75" fill="none" strokeWidth="2.5" className="stroke-faint" />
        <circle cx="8" cy="8" r="3.5" className="fill-destructive" />
      </svg>
      <Tip align={align}>Sentry Mode is on.</Tip>
    </TipTrigger>
  );
}
