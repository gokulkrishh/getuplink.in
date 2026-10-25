import type { ReactNode } from "react";
import { ByPeriod } from "@/components/stats/period-scope";
import type { HomePeriod } from "@/components/stats/periods";
import type { DrivingPeriod } from "@/lib/driving-figures";
import type { Timeframe } from "@/lib/periods";

// One choice of the home switch: what it covers and the primary car's driving figures for it (null when
// they couldn't be read).
export type HomeFrame = { key: HomePeriod; frame: Timeframe; driving: DrivingPeriod | null };

// A section rendered for every choice of the switch, showing the one picked (see ByPeriod, and `steady` there).
export function eachFrame(frames: HomeFrame[], render: (frame: HomeFrame) => ReactNode, { steady = false }: { steady?: boolean } = {}) {
  return <ByPeriod steady={steady} panels={Object.fromEntries(frames.map((f) => [f.key, render(f)]))} />;
}
