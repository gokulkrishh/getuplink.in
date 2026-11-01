import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

// One figure language for the home page pictures (the hero and the three feature sections): a rounded
// grey stage that crops its contents, one gutter (20px on a phone, 32px from sm up), one shadow for the
// main surface and a tighter one for the small card that sits across its edge. The stage has a fixed
// height, so nothing on the page moves while a picture animates or loads.
export const SURFACE = "border bg-background shadow-[0_1px_2px_rgb(0_0_0/0.04),0_16px_40px_-12px_rgb(0_0_0/0.14)]";
export const SATELLITE = "border bg-background shadow-[0_1px_2px_rgb(0_0_0/0.06),0_8px_20px_-6px_rgb(0_0_0/0.16)]";

export function FigureStage({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div aria-hidden="true" className={cn("relative w-full overflow-hidden rounded-2xl bg-muted text-left select-none", className)}>
      {children}
    </div>
  );
}

// A filler line standing in for words the picture doesn't need.
export function Bar({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span className={cn("block h-1.5 rounded-full bg-muted-foreground/20", className)} style={style} />;
}
