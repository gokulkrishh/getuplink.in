import type { ReactNode } from "react";
import { ByPeriod } from "@/components/stats/period-scope";
import type { Frame } from "@/lib/frames";

// One choice of the switch (see periodFrames).
export type HomeFrame = Frame;

// A section rendered for every choice of the switch, showing the one picked (see ByPeriod, and `steady` there).
export function eachFrame(frames: Frame[], render: (frame: Frame) => ReactNode, { steady = false }: { steady?: boolean } = {}) {
  return <ByPeriod steady={steady} panels={Object.fromEntries(frames.map((f) => [f.key, render(f)]))} />;
}
