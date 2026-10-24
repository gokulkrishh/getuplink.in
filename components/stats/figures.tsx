import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Figure = { label: string; value: ReactNode; key?: ReactNode };

// A few related numbers under a headline, each with a small label above it ("Battery / 29.5 °C"). They
// sit side by side and wrap whole on a phone, which reads better than one long "a · b · c" line that
// breaks mid-value. `key` is an optional swatch before the label, like a chart legend.
export function Figures({ figures, className }: { figures: (Figure | null | false)[]; className?: string }) {
  const shown = figures.filter((f): f is Figure => Boolean(f));
  if (shown.length === 0) return null;
  return (
    <dl className={cn("flex flex-wrap gap-x-6 gap-y-2", className)}>
      {shown.map((f) => (
        <div key={f.label}>
          <dt className="flex items-center gap-1.5 text-xs text-faint">
            {f.key}
            {f.label}
          </dt>
          <dd className="text-sm tabular-nums">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}
