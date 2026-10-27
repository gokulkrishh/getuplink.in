"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export type StatusBar = { day: string; label: string; words: string; className: string; problems: string[] };

// The status page's 90 day bars, with a tip for the day under the pointer, or the day tapped on a phone:
// the date, how it went, and what the checks found that day. A tap outside the bars closes it.
export function StatusBars({ bars, label }: { bars: StatusBar[]; label: string }) {
  const [active, setActive] = useState<number | null>(null);
  const bar = active === null ? null : bars[active];
  // Kept inside the row: anchored left on the first third, right on the last, centred between.
  const at = active === null ? 0 : (active + 0.5) / bars.length;
  return (
    <div className="relative mt-3" onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)} onBlur={() => setActive(null)}>
      <div className="flex h-8 gap-px" role="list" aria-label={label}>
        {bars.map((b, k) => (
          <button
            key={b.day}
            type="button"
            role="listitem"
            aria-label={`${b.label}: ${b.words}${b.problems.length ? `. ${b.problems.join(". ")}` : ""}`}
            onPointerEnter={(e) => e.pointerType === "mouse" && setActive(k)}
            onClick={() => setActive((a) => (a === k ? null : k))}
            onFocus={() => setActive(k)}
            className={cn("flex-1 transition-opacity duration-150 focus-visible:outline-2 focus-visible:outline-ring", b.className, active !== null && active !== k && "opacity-60")}
          />
        ))}
      </div>
      {bar && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-full z-10 mb-2 w-max max-w-[min(20rem,calc(100vw-2rem))] border bg-background px-3 py-2 text-xs shadow-sm"
          style={at < 1 / 3 ? { left: 0 } : at > 2 / 3 ? { right: 0 } : { left: `${at * 100}%`, transform: "translateX(-50%)" }}
        >
          <p className="font-medium">{bar.label}</p>
          <p className="text-muted-foreground">{bar.words}</p>
          {bar.problems.map((p) => (
            <p key={p} className="mt-1 text-muted-foreground">
              {p}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
