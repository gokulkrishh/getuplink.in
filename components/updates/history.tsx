import { type HistoryRow, HistoryRows } from "@/components/updates/history-rows";
import { DECIMALS, formatDate, formatDuration, formatNumber, formatShortDate } from "@/lib/format";
import { type LoadMore, paged } from "@/lib/list";
import type { ReleaseNotesByVersion } from "@/lib/release-notes";
import type { VersionChange } from "@/lib/server/dashboard";

// "12 Oct" this year, "24 Dec 2025" otherwise.
function historyDate(value: string, now: number): string {
  return formatDate(value).endsWith(formatDate(now).slice(-4)) ? formatShortDate(value) : formatDate(value);
}

// The history as rows for the browser (see HistoryRows). `notes` holds the notes of the versions these
// rows show; a version without notes has a plain row.
export function versionRows(history: VersionChange[], notes: ReleaseNotesByVersion, now: number): HistoryRow[] {
  return history.map((change) => {
    const { timeline } = change;
    const parts = timeline
      ? [
          timeline.downloadMin !== undefined && `Downloaded in ${formatDuration(timeline.downloadMin * 60)}`,
          timeline.installMin !== undefined && `Installed in ${formatDuration(timeline.installMin * 60)}`,
        ].filter(Boolean)
      : [];
    return {
      key: change.detected_at,
      version: change.version,
      // Always within days of Installed, which carries the year.
      received: change.previous_version && change.available_at ? formatShortDate(change.available_at) : "",
      // The first version was already on the car when Uplink first saw it; Tesla gives no install date.
      installed: change.previous_version ? historyDate(change.detected_at, now) : "Before Uplink",
      firstSeen: change.previous_version ? null : historyDate(change.detected_at, now),
      odometer: change.odometer_km != null ? formatNumber(change.odometer_km, DECIMALS.km) : null,
      timeline: parts.length ? parts.join(" · ") : null,
      notes: notes[change.version] ?? null,
    };
  });
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

// Every version, newest first, with its timings and release notes: the latest few, then the rest from `more`
// (bound to the car) on Show more. `notes` only needs the versions of those few.
export function VersionHistory({ history, notes, now, more }: { history: VersionChange[]; notes: ReleaseNotesByVersion; now: number; more: LoadMore<HistoryRow> }) {
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
      {history.length === 0 ? <EmptyHistory /> : <HistoryRows list={paged(versionRows(history, notes, now))} load={more} />}
    </section>
  );
}
