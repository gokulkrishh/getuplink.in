import { Tip, TipTrigger } from "@/components/tip";
import { formatAgo, formatSeen } from "@/lib/format";
import { cn } from "@/lib/utils";

// A car that streamed in the last 10 minutes is awake.
export const AWAKE_MS = 10 * 60 * 1000;

// "● Synced 4 minutes ago": when Uplink last heard from the car, the newer of its last streamed reading and
// the last check. A state word ("Online") from a check hours ago would be stale, so none is shown. The dot is
// green only while the car is streaming. The tooltip has both times.
export function CarStatus({
  streaming,
  seenAt,
  checkedAt,
  now,
}: {
  state?: string | null;
  // The car streamed a reading in the last few minutes.
  streaming: boolean;
  seenAt: string | null;
  checkedAt: string | null;
  now: number;
}) {
  const times = [seenAt, checkedAt].filter((t): t is string => t !== null);
  const last = times.length ? times.reduce((a, b) => (Date.parse(a) > Date.parse(b) ? a : b)) : null;
  const label = last ? `Synced ${formatAgo(last, now)}` : "Not synced yet";
  const dot = <span className={cn("size-1.5 rounded-full", streaming ? "bg-positive" : "bg-faint")} aria-hidden="true" />;
  const lines = [seenAt && `Last data from the car ${formatSeen(seenAt, now)}`, checkedAt && `Last check ${formatSeen(checkedAt, now)}`].filter(
    (line): line is string => Boolean(line),
  );
  if (lines.length === 0) {
    return (
      <span className="inline-flex items-center gap-1.5">
        {dot}
        {label}
      </span>
    );
  }
  return (
    <TipTrigger className="inline-flex items-center gap-1.5">
      {dot}
      {label}
      <span className="sr-only">. {lines.join(". ")}</span>
      <Tip>
        {lines.map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </Tip>
    </TipTrigger>
  );
}
