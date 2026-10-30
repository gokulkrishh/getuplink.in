"use client";

import {
  BatteryCharging,
  BellRing,
  Car,
  ChartColumn,
  Gauge,
  Link2,
  type LucideIcon,
  MapPin,
  Settings2,
  Sparkles,
  Users,
  Wrench,
  Zap,
} from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";
import { NativeSelect } from "@/components/ui/native-select";
import { formatShortDate } from "@/lib/format";
import type { Entry, EntryIcon } from "@/lib/whats-new";
import { cn } from "@/lib/utils";

// The Release notes page, laid out like the release notes in a Tesla: pick a version, then a feature from the
// list. On a desktop the feature opens in a pane beside the list; on a phone it opens under its row, one at
// a time. A blue dot marks what was new to the owner when they opened the page (`newIds`, kept for the visit).
const ICONS: Record<EntryIcon, LucideIcon> = {
  Sparkles,
  Zap,
  BatteryCharging,
  Gauge,
  Car,
  Users,
  Link2,
  BellRing,
  Settings2,
  ChartColumn,
  MapPin,
  Wrench,
};

type Release = { version: string; entries: Entry[] };

// The words and the screenshot. `ratio` holds the picture's box at the tallest one in the version, so the
// pane (and, on a phone, the open row) keeps its size from one feature to the next; the picture sits inside
// it on the soft background.
// `title` false on a phone, where the words open right under the row that already names the feature.
function Detail({ entry, ratio, title = true }: { entry: Entry; ratio?: number; title?: boolean }) {
  const img = entry.image;
  return (
    <div className="space-y-4">
      {img && (
        <div
          className="relative overflow-hidden border bg-muted/40"
          style={{
            aspectRatio: ratio
              ? `1 / ${ratio}`
              : `${img.width} / ${img.height}`,
          }}
        >
          <Image
            src={img.src}
            alt={img.alt}
            fill
            sizes="(min-width: 672px) 408px, 100vw"
            className="object-contain object-top"
          />
        </div>
      )}
      <div className="space-y-1">
        {title && <h3 className="text-sm font-medium">{entry.title}</h3>}
        <p className="text-sm text-muted-foreground">
          {entry.more ? `${entry.text} ${entry.more}` : entry.text}
        </p>
      </div>
    </div>
  );
}

export function ReleasesList({
  releases,
  newIds,
}: {
  releases: Release[];
  newIds: string[];
}) {
  const [v, setV] = useState(0);
  const [sel, setSel] = useState(releases[0].entries[0].id);
  // On a phone each feature opens under its own row and stays open until tapped again, so opening one never
  // closes another above it and moves the row under the finger. The first starts open.
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set([releases[0].entries[0].id]));
  // Kept from the first render: opening the page marks everything seen, which would drop the dots at once.
  const [fresh] = useState(() => new Set(newIds));
  const rows = useRef<Record<string, HTMLButtonElement | null>>({});
  const release = releases[v];
  const selected =
    release.entries.find((e) => e.id === sel) ?? release.entries[0];
  // The tallest screenshot in this version, as height over width.
  const ratio =
    Math.max(
      0,
      ...release.entries.map((e) =>
        e.image ? e.image.height / e.image.width : 0,
      ),
    ) || undefined;

  const pick = (id: string) => setSel(id);
  // A tap: the desktop pane shows it; on a phone it opens or closes under its row.
  const tap = (id: string) => {
    setSel(id);
    setOpened((o) => {
      const next = new Set(o);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const move = (by: number) => {
    const i = release.entries.findIndex((e) => e.id === selected.id);
    const next =
      release.entries[
        Math.max(0, Math.min(release.entries.length - 1, i + by))
      ];
    pick(next.id);
    rows.current[next.id]?.focus();
  };

  return (
    <div className="space-y-6">
      <div className="sm:w-64">
        <NativeSelect
          aria-label="Version"
          value={v}
          onChange={(e) => {
            const i = Number(e.target.value);
            setV(i);
            setSel(releases[i].entries[0].id);
            setOpened(new Set([releases[i].entries[0].id]));
          }}
        >
          {releases.map((r, i) => (
            <option key={r.version} value={i}>
              Version {r.version} ·{" "}
              {formatShortDate(`${r.entries[0].date}T00:00:00+05:30`)}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="sm:grid sm:grid-cols-[240px_minmax(0,1fr)] sm:gap-6">
        <ul
          aria-label={`Version ${release.version}`}
          className="divide-y border-y sm:divide-y-0 sm:border-y-0"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              move(e.key === "ArrowDown" ? 1 : -1);
            }
          }}
        >
          {release.entries.map((e) => {
            const Icon = ICONS[e.icon];
            const on = e.id === selected.id;
            return (
              <li key={e.id}>
                <button
                  type="button"
                  ref={(el) => {
                    rows.current[e.id] = el;
                  }}
                  aria-pressed={on}
                  aria-expanded={opened.has(e.id)}
                  onClick={() => tap(e.id)}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset",
                    on ? "bg-muted" : "hover:bg-muted/50",
                  )}
                >
                  <Icon
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-foreground">
                      {e.title}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {e.kind}
                    </span>
                  </span>
                  {fresh.has(e.id) && (
                    <>
                      <span
                        className="size-1.5 shrink-0 rounded-full bg-chart-accent"
                        aria-hidden="true"
                      />
                      <span className="sr-only">New</span>
                    </>
                  )}
                </button>
                {opened.has(e.id) && (
                  <div className="px-3 pt-1 pb-5 sm:hidden">
                    <Detail entry={e} title={false} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <div className="max-sm:hidden">
          <Detail entry={selected} ratio={ratio} />
        </div>
      </div>
    </div>
  );
}
