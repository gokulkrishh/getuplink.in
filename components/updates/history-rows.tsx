"use client";

import { ChevronRight } from "lucide-react";
import { ReleaseNotesList } from "@/components/release-notes";
import { TableBox } from "@/components/scroll-x";
import { usePaged } from "@/components/show-more";
import { TipTrigger } from "@/components/tip";
import type { LoadMore, Paged } from "@/lib/list";
import type { ReleaseNote } from "@/lib/release-notes";
import { cn } from "@/lib/utils";
import { TABLE_HEAD } from "@/lib/table-frame";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

// One version in the history as the browser draws it, every text worked out on the server (see versionRows
// in history.tsx). A row carries its own release notes, so a row not sent yet sends none.
export type HistoryRow = {
  key: string;
  version: string;
  received: string;
  installed: string;
  // The first version seen was already installed when tracking began; Tesla doesn't report install dates.
  // Its installed text says so, and this is the day Uplink first saw it ("29 Oct"). Null for any other version.
  firstSeen: string | null;
  odometer: string | null;
  timeline: string | null;
  notes: ReleaseNote[] | null;
};

// Received, installed and odometer cells of a history row.
function HistoryCells({ row }: { row: HistoryRow }) {
  return (
    <>
      <span className="text-right text-faint tabular-nums">{row.received}</span>
      {row.firstSeen ? (
        // Installed before Uplink's first look, so it's greyed out and explained on hover.
        <TipTrigger className="text-right whitespace-nowrap text-faint" tip={`Already installed when Uplink first saw your car on ${row.firstSeen}`}>
          {row.installed}
          <span className="sr-only">. Already installed when Uplink first saw your car on {row.firstSeen}.</span>
        </TipTrigger>
      ) : (
        <span className="text-right text-muted-foreground tabular-nums">{row.installed}</span>
      )}
      <span className="text-right text-faint tabular-nums">
        {row.odometer && (
          <>
            {row.odometer}
            <span className="ml-0.5 text-xs">km</span>
          </>
        )}
      </span>
    </>
  );
}

// "Downloaded in 25 min · Installed in 32 min", on its own line under the row (rows without it stay as they were).
const Timeline = ({ text }: { text: string | null }) => (text ? <span className="col-span-full -mt-1 pb-0.5 pl-5 text-xs text-faint">{text}</span> : null);

// One history row: expandable to its release notes when Tesla published them.
function HistoryItem({ row }: { row: HistoryRow }) {
  if (!row.notes) {
    return (
      <li className={cn("history-cols", "border-t px-4 py-2.5")}>
        <span className="truncate pl-5 font-mono">{row.version}</span>
        <HistoryCells row={row} />
        <Timeline text={row.timeline} />
      </li>
    );
  }
  return (
    <li className="border-t">
      <Collapsible className="group/row">
        {/* A div (with the button role): the row holds the Installed cell's own tip button. */}
        <CollapsibleTrigger nativeButton={false} render={<div />} className={cn("history-cols", "w-full cursor-pointer px-4 py-2.5 text-left hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring")}>
          <span className="sr-only">Show release notes</span>
          <span className="flex min-w-0 items-center gap-1.5 font-mono">
            <ChevronRight className="size-3.5 shrink-0 self-center text-faint transition-transform group-data-open/row:rotate-90" aria-hidden="true" />
            <span className="truncate">{row.version}</span>
          </span>
          <HistoryCells row={row} />
          <Timeline text={row.timeline} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pr-4 pb-4 pl-9">
          <ReleaseNotesList notes={row.notes} />
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

// Versions as a table: the first rows come with the page, "Show N more" fetches the rest (with their notes)
// and adds them to the same table. On phones the table keeps its columns and scrolls sideways.
export function HistoryRows({ list, load }: { list: Paged<HistoryRow>; load: LoadMore<HistoryRow> }) {
  const { rows, button } = usePaged(list, load);
  return (
    <>
      <TableBox>
        <div className="max-sm:min-w-xl">
          <div className={cn("history-cols", "px-4 text-xs text-faint", TABLE_HEAD)}>
            <h3 className="pl-5">Versions</h3>
            <span className="text-right">Received</span>
            <span className="text-right">Installed</span>
            <span className="text-right">Odometer</span>
          </div>
          <ol className="text-sm">
            {rows.map((row) => (
              <HistoryItem key={row.key} row={row} />
            ))}
          </ol>
        </div>
      </TableBox>
      {button}
    </>
  );
}
