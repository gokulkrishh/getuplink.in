"use client";

import { ChevronRight, Sparkles } from "lucide-react";
import { useState } from "react";

// The box, the same while loading, so the page doesn't move when the tips arrive. Two lines of tip text
// are held, so turning between a short and a long tip doesn't move it either.
const BOX = "space-y-2 border px-4 py-3";

// Text the AI wrote, in one box style wherever it stands alone: Home's tips on the week
// (lib/week-wording.ts) and a drive's summary (lib/drive-wording.ts). Several notes show one at a time; the
// next button turns them, and they were written ahead, so turning costs nothing.
export function AiNotes({ title, notes: tips }: { title: string; notes: string[] }) {
  const [at, setAt] = useState(0);
  if (tips.length === 0) return null;
  const tip = tips[at % tips.length];
  return (
    <section aria-label={title} className={BOX}>
      <div className="flex h-6 items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          {/* The AI mark. */}
          <span className="flex size-5 items-center justify-center text-muted-foreground">
            <Sparkles className="size-3.5" aria-hidden="true" />
            <span className="sr-only">Written by AI</span>
          </span>
          {/* Shimmers once as the notes arrive; turning to the next one doesn't replay it. */}
          <span className="ai-shimmer">{title}</span>
        </div>
        {tips.length > 1 && (
          <button
            type="button"
            onClick={() => setAt((k) => (k + 1) % tips.length)}
            aria-label={`Next, ${(at % tips.length) + 1} of ${tips.length}`}
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

// In the notes' place while they load: plain blocks, since there may turn out to be none.
export function AiNotesSkeleton() {
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
