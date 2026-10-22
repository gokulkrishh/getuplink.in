"use client";

import { useRef, useState, type PointerEvent } from "react";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MAP_HEIGHT, MAP_WIDTH, STATE_PATHS } from "@/lib/india-map";
import { formatShortDate } from "@/lib/format";
import { STATES, type StateCode } from "@/lib/india-states";
import { compareVersions, MIN_GROUP } from "@/lib/rollout";
import type { VersionStates } from "@/lib/rollout-states";
import { cn } from "@/lib/utils";

const cars = (n: number) => `${n} ${n === 1 ? "car" : "cars"}`;

type Hover = { code: StateCode; x: number; y: number };

// India's states, shaded where the picked version runs: darker for more cars. Only states shown on their
// own are shaded; a region roll-up's states stay blank, or the shading would say they have cars.
// Hovering (or tapping) a state shows its tooltip. Every state without numbers gets the same line, so
// the tooltip can't say which of them have cars either.
export function RolloutMap({ versions: given }: { versions: VersionStates[] }) {
  // Newest first, so the dropdown opens on the latest version.
  const versions = given.toSorted((a, b) => compareVersions(b.version, a.version));
  const [picked, setPicked] = useState(versions[0]?.version ?? "");
  const [hover, setHover] = useState<Hover | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const current = versions.find((v) => v.version === picked) ?? versions[0];
  if (!current) return null;
  const shades = new Map<StateCode, number>();
  const most = Math.max(1, ...current.groups.map((g) => g.cars));
  for (const g of current.groups) if (g.kind === "state") shades.set(g.code, 0.3 + 0.6 * (g.cars / most));
  const shown = hover && current.groups.find((g) => g.kind === "state" && g.code === hover.code);

  // The pointer's place in the frame, as a share of its size, so the tip can lean inwards at the edges.
  const point = (code: StateCode) => (event: PointerEvent<SVGPathElement>) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box) return;
    setHover({ code, x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height });
  };

  return (
    <div className="space-y-4">
      {versions.length > 1 && (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Version"
            className="flex h-8 cursor-pointer items-center gap-2 border bg-background px-3 font-mono text-sm tabular-nums hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none data-popup-open:bg-muted"
          >
            {current.version}
            <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuRadioGroup value={current.version} onValueChange={(value) => setPicked(value as string)}>
              {versions.map((v) => (
                <DropdownMenuRadioItem key={v.version} value={v.version} className="font-mono tabular-nums">
                  {v.version}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <div ref={frame} className="relative mx-auto w-full max-w-md" onPointerLeave={() => setHover(null)}>
      <svg
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        role="img"
        aria-label={`Map of India: states where ${current.version} runs`}
        className="block h-auto w-full"
      >
        {(Object.entries(STATE_PATHS) as [StateCode, string][]).map(([code, d]) => {
          const shade = shades.get(code);
          return (
            <path
              key={code}
              d={d}
              onPointerMove={point(code)}
              onPointerDown={point(code)}
              className={cn(
                shade ? "fill-foreground stroke-background" : "fill-muted stroke-border",
                hover?.code === code && "stroke-foreground",
              )}
              style={shade ? { fillOpacity: shade } : undefined}
              strokeWidth={0.6}
              strokeLinejoin="round"
            />
          );
        })}
      </svg>
      {hover && (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute z-10 -translate-y-full border bg-background px-2 py-1 text-xs whitespace-nowrap",
            hover.x > 0.6 ? "-translate-x-full" : hover.x > 0.4 && "-translate-x-1/2",
          )}
          style={{ left: `${hover.x * 100}%`, top: `calc(${hover.y * 100}% - 8px)` }}
        >
          <span className="text-muted-foreground">{STATES[hover.code].name}</span>
          {shown ? (
            <>
              <span className="block font-mono tabular-nums">{cars(shown.cars)}</span>
              <span className="block font-mono tabular-nums">
                {shown.firstArrived ? `First ${formatShortDate(shown.firstArrived)}` : "First arrival unknown"}
              </span>
            </>
          ) : (
            <span className="block">No numbers shown</span>
          )}
        </span>
      )}
      </div>
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
