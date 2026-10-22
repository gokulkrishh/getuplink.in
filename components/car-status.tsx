import { Tip, TipTrigger } from "@/components/tip";
import { formatSeen } from "@/lib/format";
import { cn } from "@/lib/utils";

// A car that streamed in the last 10 minutes is awake.
export const AWAKE_MS = 10 * 60 * 1000;

// "Online" only means something right after a check; older than this shows grey.
const ONLINE_FRESH_MS = 15 * 60 * 1000;

// "● Online" or "● Asleep" as of the last check. When not online, a tooltip says when it last was.
export function CarStatus({
  state,
  streaming,
  seenAt,
  checkedAt,
  now,
}: {
  state: string | null;
  // The car streamed a reading in the last few minutes.
  streaming: boolean;
  seenAt: string | null;
  checkedAt: string | null;
  now: number;
}) {
  const fresh = checkedAt !== null && now - Date.parse(checkedAt) < ONLINE_FRESH_MS;
  const online = streaming || (state === "online" && fresh);
  const label =
    online
      ? "Online"
      : state === "online"
        ? "Online earlier"
        : state === "offline"
          ? "Offline"
          : state
            ? "Asleep"
            : "Not checked yet";
  const dot = <span className={cn("size-1.5 rounded-full", online ? "bg-positive" : "bg-faint")} aria-hidden="true" />;
  // Both times live in this one tooltip: when the car was last reachable, and when Uplink last looked.
  const lines = [
    !online && (seenAt ? `Last online ${formatSeen(seenAt, now)}` : "Not seen online yet"),
    checkedAt && `Last checked ${formatSeen(checkedAt, now)}`,
  ].filter((line): line is string => Boolean(line));
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
