import { ChevronRight } from "lucide-react";
import { ChartCard } from "@/components/chart-card";
import { ReleaseNotesList } from "@/components/release-notes";
import { ShowMore } from "@/components/show-more";
import { Tip, TipTrigger } from "@/components/tip";
import { VersionChart } from "@/components/version-chart";
import { DECIMALS, formatDate, formatDuration, formatNumber, formatShortDate } from "@/lib/format";
import { LIST_PREVIEW } from "@/lib/list";
import type { ReleaseNotesByVersion } from "@/lib/release-notes";
import type { VersionChange } from "@/lib/server/dashboard";
import { cn } from "@/lib/utils";

// "12 Oct" this year, "24 Dec 2025" otherwise.
function historyDate(value: string, now: number): string {
  return formatDate(value).endsWith(formatDate(now).slice(-4)) ? formatShortDate(value) : formatDate(value);
}


// Received, installed and odometer cells of a history row.
function HistoryCells({ change, now }: { change: VersionChange; now: number }) {
  // The first version was already installed when tracking began; Tesla doesn't report install dates.
  const date = historyDate(change.detected_at, now);
  return (
    <>
      <span className="text-right text-faint tabular-nums">
        {/* Always within days of Installed, which carries the year. */}
        {change.previous_version && change.available_at ? formatShortDate(change.available_at) : ""}
      </span>
      {change.previous_version ? (
        <span className="text-right text-muted-foreground tabular-nums">{date}</span>
      ) : (
        // First version seen: installed some time before this date, so it's greyed out and explained on hover.
        <TipTrigger className="text-right text-faint tabular-nums">
          {date}
          <span className="sr-only">. Already installed when tracking started.</span>
          <Tip>Already installed when tracking started</Tip>
        </TipTrigger>
      )}
      <span className="text-right text-faint tabular-nums">{change.odometer_km != null && (
          <>
            {formatNumber(change.odometer_km, DECIMALS.km)}
            <span className="ml-0.5 text-xs">km</span>
          </>
        )}</span>
    </>
  );
}

// Empty history: a faint dashed preview of the chart, then what will fill it and how to start.
function EmptyHistory() {
  return (
    <div className="space-y-4">
      <div className="bg-muted px-3 pt-4 pb-2">
      <svg viewBox="0 0 300 48" className="h-20 w-full text-border" preserveAspectRatio="none" aria-hidden="true">
        <path
          d="M0 44H80V32H170V20H250V8H300"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      </div>
      <div className="space-y-1">
        <p className="text-sm">No versions yet</p>
        <p className="max-w-md text-sm text-muted-foreground">
          A version shows once Uplink sees the car awake.
        </p>
      </div>
    </div>
  );
}

// "Downloaded in 25 min · Installed in 32 min", on its own line under the row (rows without it stay as they were).
function Timeline({ timeline }: { timeline: VersionChange["timeline"] }) {
  if (!timeline) return null;
  const parts = [
    timeline.downloadMin !== undefined && `Downloaded in ${formatDuration(timeline.downloadMin * 60)}`,
    timeline.installMin !== undefined && `Installed in ${formatDuration(timeline.installMin * 60)}`,
  ].filter(Boolean);
  return parts.length ? <span className="col-span-full -mt-1 pb-0.5 pl-5 text-xs text-faint">{parts.join(" · ")}</span> : null;
}

// One history row: expandable to its release notes when Tesla published them.
function HistoryRow({ change, notes, now }: { change: VersionChange; notes: ReleaseNotesByVersion; now: number }) {
  const versionNotes = notes[change.version];
  if (!versionNotes) {
    return (
      <li className={cn("history-cols", "border-t py-2.5")}>
        <span className="truncate pl-5 font-mono">{change.version}</span>
        <HistoryCells change={change} now={now} />
        <Timeline timeline={change.timeline} />
      </li>
    );
  }
  return (
    <li className="border-t">
      <details className="group/row">
        <summary className={cn("history-cols", "cursor-pointer list-none py-2.5 hover:text-foreground [&::-webkit-details-marker]:hidden")}>
          <span className="sr-only">Show release notes</span>
          <span className="flex min-w-0 items-center gap-1.5 font-mono">
            <ChevronRight
              className="size-3.5 shrink-0 self-center text-faint transition-transform group-open/row:rotate-90"
              aria-hidden="true"
            />
            <span className="truncate">{change.version}</span>
          </span>
          <HistoryCells change={change} now={now} />
          <Timeline timeline={change.timeline} />
        </summary>
        <div className="pb-4 pl-5">
          <ReleaseNotesList notes={versionNotes} />
        </div>
      </details>
    </li>
  );
}

// The version chart, then every version newest first with its timings and release notes.
export function VersionHistory({ history, notes, now, until }: { history: VersionChange[]; notes: ReleaseNotesByVersion; now: number; until: string | null }) {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-medium tracking-heading">History</h2>
        {history.length > 0 && (
          <p className="text-sm text-muted-foreground tabular-nums">
            {history.length} {history.length === 1 ? "version" : "versions"}
          </p>
        )}
      </div>
      {history.length === 0 ? (
        <EmptyHistory />
      ) : (
        <>
          <ChartCard
            as="h3"
            title="Software version"
            description="Each step up is a new version arriving."
          >
            <VersionChart changes={[...history].reverse()} until={until} />
          </ChartCard>
          {/* On phones the table keeps its columns and scrolls sideways. */}
          <div className="max-sm:-mx-1 max-sm:overflow-x-auto max-sm:overflow-y-hidden max-sm:px-1 pt-6">
            <div className="max-sm:min-w-xl">
            <div className={cn("history-cols", "pb-2 text-xs text-faint")}>
              <h3 className="pl-5">Versions</h3>
              <span className="text-right">Received</span>
              <span className="text-right">Installed</span>
              <span className="text-right">Odometer</span>
            </div>
            <ol className="text-sm">
              {history.slice(0, LIST_PREVIEW).map((change) => (
                <HistoryRow key={change.detected_at} change={change} notes={notes} now={now} />
              ))}
            </ol>
            {history.length > LIST_PREVIEW && (
              <ShowMore count={history.length - LIST_PREVIEW}>
                <ol className="text-sm">
                  {history.slice(LIST_PREVIEW).map((change) => (
                    <HistoryRow key={change.detected_at} change={change} notes={notes} now={now} />
                  ))}
                </ol>
              </ShowMore>
            )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
