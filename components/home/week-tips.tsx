"use client";

import { ChevronRight, Sparkles } from "lucide-react";
import { useState } from "react";
import { InfoButton } from "@/components/info-button";

// The box, the same while loading, so the page doesn't move when the tips arrive. Two lines of tip text
// are held, so turning between a short and a long tip doesn't move it either.
const BOX = "space-y-2 border px-4 py-3";

// Home's AI tips on the week (lib/week-wording.ts), one at a time. The next button shows the next one; the
// tips are written once a day, so turning them costs nothing.
export function WeekTips({ tips }: { tips: string[] }) {
  const [at, setAt] = useState(0);
  if (tips.length === 0) return null;
  const tip = tips[at % tips.length];
  return (
    <section aria-label="Tips" className={BOX}>
      <div className="flex h-6 items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <InfoButton
            label="AI tips"
            ariaLabel="Written by AI"
            icon={<Sparkles className="size-3.5" aria-hidden="true" />}
            className="size-5 text-muted-foreground"
          >
            Written by AI from this week&apos;s figures.
          </InfoButton>
          {/* Shimmers once as the tips arrive; turning to the next one doesn't replay it. */}
          <span className="ai-shimmer">Tips</span>
        </div>
        {tips.length > 1 && (
          <button
            type="button"
            onClick={() => setAt((k) => (k + 1) % tips.length)}
            aria-label={`Next tip, ${(at % tips.length) + 1} of ${tips.length}`}
            className="tap-target inline-flex items-center gap-1.5 rounded-sm text-xs text-muted-foreground tabular-nums transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            {(at % tips.length) + 1} of {tips.length}
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
      <p className="min-h-15 text-sm text-muted-foreground sm:min-h-10" aria-live="polite">
        {tip}
      </p>
    </section>
  );
}

// In the tips' place while they load: plain blocks, since a week may turn out to have no tips.
export function WeekTipsSkeleton() {
  return (
    <div className={BOX} data-skeleton="tips" aria-hidden="true">
      <div className="flex h-6 items-center">
        <div className="h-3 w-16 animate-pulse bg-muted" />
      </div>
      <div className="min-h-15 space-y-2 pt-1 sm:min-h-10">
        <div className="h-3 w-full animate-pulse bg-muted" />
        <div className="h-3 w-2/3 animate-pulse bg-muted" />
      </div>
    </div>
  );
}
