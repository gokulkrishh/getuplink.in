import { AutoRefresh } from "@/components/auto-refresh";
import { formatDuration, formatSeen } from "@/lib/format";
import type { Snapshot } from "@/lib/server/dashboard";
import { Measure } from "@/components/measure";
import { compareVersions } from "@/lib/rollout";
import { normaliseVersion } from "@/lib/versions";
import { Progress } from "@/components/ui/progress";

// The update's states, as lib/telemetry.ts's UPDATE_FIELDS works them out (and Tesla's check reports them, but
// for preparing). Available and scheduled are both ready to install: scheduled says when it starts.
const STATUS: Record<string, string> = {
  installing: "Installing",
  available: "Ready to install",
  scheduled: "Ready to install",
  downloading: "Downloading",
  downloading_wifi_wait: "Waiting for Wi-Fi",
  preparing: "Downloaded, preparing",
};

// The car offers the update: the only states marked with the green dot.
export const READY_STATUSES = ["available", "scheduled"];

// The states that change by themselves, so a page showing one refreshes itself (see AutoRefresh): progress
// moves while downloading or installing, a download waiting for Wi-Fi starts once the car is on it, and a
// downloaded update becomes ready to install.
export const LIVE_STATUSES = ["downloading", "installing", "downloading_wifi_wait", "preparing"];

// An update is available, scheduled, downloading, waiting for Wi-Fi or installing. An offer no newer than
// `installed` (the version the car runs now) is a stale check: the car installed it since, as the stream
// can tell before the next online check does. The rollout's pendingUpdate applies the same rule.
export function isPending(snapshot: Snapshot | null, installed: string | null = null): boolean {
  const status = snapshot?.update_status;
  if (!status || !STATUS[status]) return false;
  const offered = normaliseVersion(snapshot.update_version);
  const current = normaliseVersion(installed);
  return !(offered && current && compareVersions(offered, current) <= 0);
}

// Order: status line, then its details (progress, timing).
export function UpdateStatus({ snapshot, now }: { snapshot: Snapshot | null; now: number }) {
  const status = snapshot?.update_status;
  if (!snapshot || !status || !STATUS[status]) return null;

  const progress =
    status === "installing" ? snapshot.install_perc : status === "downloading" ? snapshot.download_perc : null;
  return (
    <div className="space-y-2">
      {LIVE_STATUSES.includes(status) && <AutoRefresh />}
      <p className="flex items-baseline gap-2">
        {READY_STATUSES.includes(status) ? (
          <span className="inline-flex items-baseline gap-2 text-foreground">
            <span className="relative flex size-2 self-center" aria-hidden="true">
              <span className="absolute inline-flex size-full rounded-full bg-positive opacity-60 motion-safe:animate-ping" />
              <span className="relative inline-flex size-2 rounded-full bg-positive" />
            </span>
            {STATUS[status]}
          </span>
        ) : (
          STATUS[status]
        )}
        {snapshot.update_version && <span className="font-mono text-muted-foreground">{snapshot.update_version}</span>}
      </p>
      {progress != null && (
        <div className="flex items-center gap-3">
          {/* shadcn's Progress, square and thin as before. A light band sweeps across the filled part so an
              in-progress update reads as alive. */}
          <Progress
            value={Math.min(100, Math.max(0, progress))}
            aria-label={`${STATUS[status]} ${progress}%`}
            className="flex-1"
            trackClassName="rounded-none bg-border"
            indicatorClassName="relative overflow-hidden bg-foreground"
            indicator={<span className="absolute inset-y-0 -left-1/2 w-1/2 bg-linear-to-r from-transparent via-background/80 to-transparent motion-safe:animate-shimmer" />}
          />
          <span className="w-10 text-left font-mono text-xs tabular-nums text-muted-foreground"><Measure text={`${progress}%`} /></span>
        </div>
      )}
      {(status === "scheduled" && snapshot.scheduled_time_ms) || snapshot.expected_duration_sec ? (
        <p className="text-sm text-muted-foreground">
          {/* Tesla's estimate for the install, as it gave it: the percent doesn't move evenly enough to
              count down from (30% of a 40 min install was 14 min from done). */}
          {status === "scheduled" && snapshot.scheduled_time_ms
            ? `Starts ${formatSeen(snapshot.scheduled_time_ms, now)}`
            : `Install takes about ${formatDuration(snapshot.expected_duration_sec!)}`}
        </p>
      ) : null}
      {status === "downloading_wifi_wait" && (
        <p className="text-sm text-muted-foreground">Connect the car to Wi-Fi to start the download.</p>
      )}
    </div>
  );
}
