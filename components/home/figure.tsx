import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

// The look of the home page's feature tiles: one shadow for the piece of product in a tile and a tighter
// one for a small card or chip that sits on it, plus a filler line for words the picture doesn't need.
export const SURFACE = "border bg-background shadow-[0_1px_2px_rgb(0_0_0/0.04),0_16px_40px_-12px_rgb(0_0_0/0.14)]";
export const SATELLITE = "border bg-background shadow-[0_1px_2px_rgb(0_0_0/0.06),0_8px_20px_-6px_rgb(0_0_0/0.16)]";

export function Bar({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span className={cn("block h-1.5 rounded-full bg-muted-foreground/20", className)} style={style} />;
}
