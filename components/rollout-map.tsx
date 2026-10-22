"use client";

import { useState } from "react";
import { Segmented } from "@/components/segmented";
import { MAP_HEIGHT, MAP_WIDTH, STATE_PATHS } from "@/lib/india-map";
import { formatShortDate } from "@/lib/format";
import type { StateCode } from "@/lib/india-states";
import { MIN_GROUP } from "@/lib/rollout";
import type { VersionStates } from "@/lib/rollout-states";

const cars = (n: number) => `${n} ${n === 1 ? "car" : "cars"}`;

// India's states, shaded where the picked version runs: darker for more cars. Only states shown on their
// own are shaded; a region roll-up's states stay blank, or the shading would say they have cars.
export function RolloutMap({ versions }: { versions: VersionStates[] }) {
  const [picked, setPicked] = useState(versions[0]?.version ?? "");
  const current = versions.find((v) => v.version === picked) ?? versions[0];
  if (!current) return null;
  const shades = new Map<StateCode, number>();
  const most = Math.max(1, ...current.groups.map((g) => g.cars));
  for (const g of current.groups) if (g.kind === "state") shades.set(g.code, 0.3 + 0.6 * (g.cars / most));

  return (
    <div className="space-y-4">
      {versions.length > 1 && (
        <div className="-mx-5 overflow-x-auto px-5">
          <Segmented
            label="Version"
            options={versions.map((v) => ({ value: v.version, label: v.version }))}
            value={current.version}
            onChange={setPicked}
          />
        </div>
      )}
      <svg
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        role="img"
        aria-label={`Map of India: states where ${current.version} runs`}
        className="mx-auto block h-auto w-full max-w-md"
      >
        {(Object.entries(STATE_PATHS) as [StateCode, string][]).map(([code, d]) => {
          const shade = shades.get(code);
          return (
            <path
              key={code}
              d={d}
              className={shade ? "fill-foreground stroke-background" : "fill-muted stroke-border"}
              style={shade ? { fillOpacity: shade } : undefined}
              strokeWidth={0.6}
              strokeLinejoin="round"
            />
          );
        })}
      </svg>
      {current.groups.length ? (
        <ul className="divide-y border-t text-sm">
          <li className="flex gap-4 py-2 text-xs text-faint">
            <span className="flex-1">State</span>
            <span className="w-28">First arrived</span>
            <span className="w-14 text-right">Cars</span>
          </li>
          {current.groups.map((g) => (
            <li key={g.kind === "state" ? g.code : g.region} className="flex gap-4 py-3 tabular-nums">
              <span className="min-w-0 flex-1">{g.kind === "state" ? g.name : `Other ${g.region} states`}</span>
              <span className="w-28 text-muted-foreground">{g.firstArrived ? formatShortDate(g.firstArrived) : "Unknown"}</span>
              <span className="w-14 text-right">{g.cars}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No state has {cars(MIN_GROUP)} on it yet.</p>
      )}
    </div>
  );
}
