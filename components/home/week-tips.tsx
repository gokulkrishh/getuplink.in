"use client";

import { RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";
import { InfoButton } from "@/components/info-button";

// Home's AI tips on the week (lib/week-wording.ts), one at a time. The arrows button shows the next; the
// tips are written once a day, so turning them costs nothing.
export function WeekTips({ tips }: { tips: string[] }) {
  const [at, setAt] = useState(0);
  if (tips.length === 0) return null;
  const tip = tips[at % tips.length];
  return (
    <section aria-label="Tips" className="space-y-2 border px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <InfoButton
            label="AI tips"
            ariaLabel="Written by AI"
            icon={<Sparkles className="size-3.5" aria-hidden="true" />}
            className="size-5 text-muted-foreground"
          >
            Written by AI from this week&apos;s figures.
          </InfoButton>
          Tips
        </div>
        {tips.length > 1 && (
          <button
            type="button"
            onClick={() => setAt((k) => (k + 1) % tips.length)}
            aria-label={`Next tip, ${(at % tips.length) + 1} of ${tips.length}`}
            className="tap-target inline-flex items-center gap-1.5 rounded-sm text-xs text-muted-foreground tabular-nums transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            {(at % tips.length) + 1} of {tips.length}
            <RefreshCw className="size-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
      <p key={at} className="ai-shimmer text-sm text-muted-foreground" aria-live="polite">
        {tip}
      </p>
    </section>
  );
}
