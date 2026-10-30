"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { ChartCard } from "@/components/chart-card";
import { Segmented } from "@/components/segmented";
import { type Bar, Bars } from "@/components/stats/bars";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DECIMALS, formatNumber, formatShortDate } from "@/lib/format";
import { compareVersions } from "@/lib/rollout";
import { type Adoption, ADOPTION_SLOTS, type AdoptionGrain, share } from "@/lib/rollout-adoption";

const cars = (n: number) => `${n} ${n === 1 ? "car" : "cars"}`;

const GRAINS: { value: AdoptionGrain; label: string }[] = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
];
// Labels on every few bars so they never collide on a phone.
const LABEL_EVERY: Record<AdoptionGrain, number> = { day: 7, week: 5 };
const SPAN_WORDS: Record<AdoptionGrain, string> = { day: `each day, last ${ADOPTION_SLOTS.day} days`, week: `each week, last ${ADOPTION_SLOTS.week} weeks` };

// The share of cars on one picked version at the end of each day or week. One version at a time keeps the
// chart to the one data hue; the dropdown opens on the newest version.
export function RolloutAdoption({ adoption }: { adoption: Record<AdoptionGrain, Adoption> }) {
  const [grain, setGrain] = useState<AdoptionGrain>("day");
  const versions = [...new Set([...adoption.day.versions, ...adoption.week.versions].map((v) => v.version))].sort((a, b) => compareVersions(b, a));
  const [picked, setPicked] = useState(versions[0] ?? "");
  const version = versions.includes(picked) ? picked : versions[0];
  if (!version) return null;

  const { slots, versions: series, since } = adoption[grain];
  // Cut short where no car's version was known yet: "each day, since 3 Oct".
  const spanWords = since === null ? SPAN_WORDS[grain] : `each ${grain}, since ${formatShortDate(since + 43_200_000)}`;
  const labelEvery = slots.length <= 7 ? 1 : slots.length <= 14 ? Math.min(2, LABEL_EVERY[grain]) : LABEL_EVERY[grain];
  const on = series.find((s) => s.version === version)?.on ?? [];
  const bars: Bar[] = slots.map((slot, k) => ({
    key: slot.key,
    label: slot.label,
    value: share(on[k] ?? 0, slot.of),
    display: formatNumber(share(on[k] ?? 0, slot.of), DECIMALS.percent),
    isCurrent: k === slots.length - 1,
    // Nothing known yet: the bar stays blank, with no tip.
    blank: slot.of === 0,
    tip: `${on[k] ?? 0} of ${cars(slot.of)}`,
  }));

  const words = grain === "day" ? "days" : "weeks";
  return (
    <ChartCard
      title="Adoption over time"
      description="Share of cars on the picked version."
      info={`Each bar is the share of cars on this version at the end of ${spanWords}. A car counts only from the day Uplink first saw its version.`}
      summary={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span id="adoption-version" className="text-sm text-muted-foreground">
              Version
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-labelledby="adoption-version"
                className="flex h-8 cursor-pointer items-center gap-2 rounded-lg border bg-background px-3 font-mono text-sm tabular-nums hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none data-popup-open:bg-muted"
              >
                {version}
                <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuRadioGroup value={version} onValueChange={(value) => setPicked(value as string)}>
                  {versions.map((v) => (
                    <DropdownMenuRadioItem key={v} value={v} className="font-mono tabular-nums">
                      {v}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Segmented label="Group by" options={GRAINS} value={grain} onChange={setGrain} />
        </div>
      }
      empty={bars.some((b) => b.value > 0) ? undefined : `No cars ran ${version} in these ${words}.`}
    >
      <Bars bars={bars} ariaLabel={`Share of cars on ${version}, ${spanWords}`} labelEvery={labelEvery} unit="%" valueWords="of cars" fit />
    </ChartCard>
  );
}
