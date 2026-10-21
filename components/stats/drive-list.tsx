import { ShowMore } from "@/components/show-more";
import type { Drive } from "@/lib/drives";
import { formatClock, formatDayLabel, formatDuration, formatKm } from "@/lib/format";
import { LIST_PREVIEW } from "@/lib/list";

function DriveRow({ drive, serial, now }: { drive: Drive; serial: number; now: number }) {
  const levels =
    drive.startLevel !== null && drive.endLevel !== null ? `${Math.round(drive.startLevel)}% to ${Math.round(drive.endLevel)}%` : null;
  return (
    <li className="grid grid-cols-session-wide items-start gap-x-4 py-4 text-sm">
      <p className="tabular-nums">{formatDayLabel(drive.start, now)}</p>
      <div className="min-w-0 space-y-1">
        <p className="truncate font-medium tabular-nums">
          <span className="mr-2 font-mono text-xs font-normal text-faint">#{serial}</span>
          {formatClock(drive.start)} to {formatClock(drive.end)}
        </p>
        <p className="truncate text-xs text-muted-foreground tabular-nums">
          {formatKm(drive.km)} · {formatDuration((drive.end - drive.start) / 1000)}
        </p>
      </div>
      <div className="space-y-1 text-right">
        {drive.whPerKm !== null && <p className="font-mono font-medium tabular-nums">{Math.round(drive.whPerKm)} Wh/km</p>}
        {levels && <p className="text-xs text-muted-foreground tabular-nums">{levels}</p>}
      </div>
      <div />
    </li>
  );
}

// Drives from the last 90 days, newest first: the latest few, then the rest behind Show more. Not grouped
// by day, since most days have only one or two. Numbers count from the oldest drive in the window.
export function DriveList({ drives, now }: { drives: Drive[]; now: number }) {
  if (drives.length === 0) return null;
  const totalKm = drives.reduce((sum, d) => sum + d.km, 0);
  const rows = (list: Drive[], offset: number) =>
    list.map((d, i) => <DriveRow key={d.start} drive={d} serial={drives.length - offset - i} now={now} />);
  return (
    <section className="space-y-6">
      <div className="flex items-baseline justify-between gap-4 text-xs tracking-wide text-faint uppercase">
        <h2 className="font-medium">Drives</h2>
        <p className="tabular-nums">
          {drives.length} {drives.length === 1 ? "drive" : "drives"} · {formatKm(totalKm)}
        </p>
      </div>
      {/* On phones the list keeps its columns and scrolls sideways. */}
      <div className="max-sm:-mx-1 max-sm:overflow-x-auto max-sm:overflow-y-hidden max-sm:px-1">
        <div className="max-sm:min-w-xl">
          <ul className="divide-y border-t">{rows(drives.slice(0, LIST_PREVIEW), 0)}</ul>
          {drives.length > LIST_PREVIEW && (
            <ShowMore count={drives.length - LIST_PREVIEW}>
              <ul className="divide-y border-t">{rows(drives.slice(LIST_PREVIEW), LIST_PREVIEW)}</ul>
            </ShowMore>
          )}
        </div>
      </div>
    </section>
  );
}
