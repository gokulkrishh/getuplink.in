"use client";

import { ReleaseNotesToggle } from "@/components/release-notes";
import { ShareBar } from "@/components/rollout-share-bar";
import { usePaged } from "@/components/show-more";
import type { LoadMore, Paged } from "@/lib/list";
import type { ReleaseNote } from "@/lib/release-notes";
import { cn } from "@/lib/utils";

// The rollout's two lists as the browser draws them, every text worked out on the server (see arrivingRows
// and versionRows in lib/rollout-rows.ts). A row carries its own release notes, so a row not sent yet sends none.
export type ArrivingRow = { version: string; n: number; offered: string; notes: ReleaseNote[] | null };

export type VersionRow = {
  version: string;
  n: number;
  cars: string;
  // No car runs it any more: the count greys out and there is no bar.
  gone: boolean;
  share: { on: number; of: number } | null;
  // First in India, Global, and how far behind the world: only what's known.
  facts: { first: string | null; global: string | null; lag: string | null };
  notes: ReleaseNote[] | null;
};

// ReleaseNotesToggle takes notes by version.
const notesOf = (version: string, notes: ReleaseNote[] | null) => (notes ? { [version]: notes } : {});

// One version on offer: cars it's waiting on and cars already on it, and its notes when Tesla sent any.
function ArrivingItem({ row }: { row: ArrivingRow }) {
  return (
    <li className="flex gap-4 py-3">
      <span className="w-6 shrink-0 pt-0.5 font-mono text-xs text-faint">{row.n}</span>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-baseline gap-4 text-sm tabular-nums">
          <span className="flex-1 font-mono font-medium">{row.version}</span>
          <span className="text-right whitespace-nowrap text-muted-foreground">{row.offered}</span>
        </div>
        <ReleaseNotesToggle version={row.version} notes={notesOf(row.version, row.notes)} stacked />
      </div>
    </li>
  );
}

// One version: cars on it now with a bar against every counted car (hover or tap it for the share), and how
// its arrival compares with the world. A version no car is on any more has no bar: an empty track reads as
// a chart still loading.
function VersionItem({ row }: { row: VersionRow }) {
  const { first, global, lag } = row.facts;
  return (
    <li className="flex gap-4 py-4">
      <span className="w-6 shrink-0 pt-0.5 font-mono text-xs text-faint">{row.n}</span>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-baseline justify-between gap-4">
          <span className="font-mono text-sm font-medium tabular-nums">{row.version}</span>
          <span className={cn("text-sm tabular-nums", row.gone && "text-faint")}>{row.cars}</span>
        </div>
        {row.share && <ShareBar {...row.share} />}
        {(first || global) && (
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
            {first && <span>{first}</span>}
            {global && <span>{global}</span>}
            {lag && <span className="text-foreground">{lag}</span>}
          </p>
        )}
        <ReleaseNotesToggle version={row.version} notes={notesOf(row.version, row.notes)} stacked />
      </div>
    </li>
  );
}

// Versions on offer, under their column heads. The first come with the page; "Show N more" fetches the rest.
export function ArrivingRows({ list, load }: { list: Paged<ArrivingRow>; load: LoadMore<ArrivingRow> }) {
  const { rows, button } = usePaged(list, load);
  return (
    <>
      <ul className="divide-y border-t">
        <li className="flex gap-4 py-2 text-xs text-faint" aria-hidden="true">
          <span className="w-6 shrink-0">#</span>
          <span className="flex-1">Version</span>
          <span>Offered · on it</span>
        </li>
        {rows.map((row) => (
          <ArrivingItem key={row.version} row={row} />
        ))}
      </ul>
      {button}
    </>
  );
}

// Every version seen, newest first, under their column heads.
export function VersionRows({ list, load }: { list: Paged<VersionRow>; load: LoadMore<VersionRow> }) {
  const { rows, button } = usePaged(list, load);
  return (
    <>
      <ul className="divide-y border-t">
        <li className="flex gap-4 py-2 text-xs text-faint" aria-hidden="true">
          <span className="w-6 shrink-0">#</span>
          <span className="flex-1">Version</span>
          <span>Cars on it</span>
        </li>
        {rows.map((row) => (
          <VersionItem key={row.version} row={row} />
        ))}
      </ul>
      {button}
    </>
  );
}
