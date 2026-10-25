import type { ReactNode } from "react";

// A chart's box (panel + h-40, as the line plots draw) holding a line of text instead, for a span with too
// little to draw, so the page keeps its shape from one period to the next.
export function ChartNote({ children }: { children: ReactNode }) {
  return (
    <div className="bg-muted px-3 pt-6 pb-2">
      <div className="flex h-40 w-full items-center justify-center px-4 text-center text-sm text-muted-foreground">{children}</div>
    </div>
  );
}
