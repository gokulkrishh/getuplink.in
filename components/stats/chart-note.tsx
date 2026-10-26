import type { ReactNode } from "react";

// One line in a chart's place, for a span with too little to draw: a sentence, not an empty panel.
export function ChartNote({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
