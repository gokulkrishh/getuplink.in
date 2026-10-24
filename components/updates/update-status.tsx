import { AutoRefresh } from "@/components/auto-refresh";
import { formatDuration, formatInstallLeft, formatSeen } from "@/lib/format";
import type { Snapshot } from "@/lib/server/dashboard";

const STATUS: Record<string, string> = {
  available: "Available",
  scheduled: "Scheduled",
  downloading: "Downloading",
  downloading_wifi_wait: "Waiting for Wi-Fi",
  installing: "Installing",
};

// An update is available, scheduled, downloading, waiting for Wi-Fi or installing.
export function isPending(snapshot: Snapshot | null): boolean {
  return Boolean(snapshot?.update_status && STATUS[snapshot.update_status]);
}

// Order: status line, then its details (progress, timing).
export function UpdateStatus({ snapshot, now }: { snapshot: Snapshot | null; now: number }) {
  const status = snapshot?.update_status;
  if (!snapshot || !status || !STATUS[status]) return null;

  const progress =
    status === "installing" ? snapshot.install_perc : status === "downloading" ? snapshot.download_perc : null;
  return (
    <div className="space-y-2">
      {(status === "downloading" || status === "installing") && <AutoRefresh />}
      <p className="flex items-baseline gap-2">
        {status === "available" ? (
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
          <div
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${STATUS[status]} ${progress}%`}
            className="h-1 flex-1 overflow-hidden bg-border"
          >
            {/* A light band sweeps across the filled part so an in-progress update reads as alive. */}
            <div className="relative h-full overflow-hidden bg-foreground" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}>
              <span className="absolute inset-y-0 -left-1/2 w-1/2 bg-linear-to-r from-transparent via-background/50 to-transparent motion-safe:animate-shimmer" />
            </div>
          </div>
          <span className="w-10 text-left font-mono text-xs tabular-nums text-muted-foreground">{progress}%</span>
        </div>
      )}
      {(status === "scheduled" && snapshot.scheduled_time_ms) || snapshot.expected_duration_sec ? (
        <p className="text-xs text-muted-foreground">
          {status === "scheduled" && snapshot.scheduled_time_ms
            ? `Starts ${formatSeen(snapshot.scheduled_time_ms, now)}`
            : status === "installing" && snapshot.install_perc != null
              ? formatInstallLeft(snapshot.expected_duration_sec!, snapshot.install_perc)
              : `Takes about ${formatDuration(snapshot.expected_duration_sec!)}`}
        </p>
      ) : null}
      {status === "downloading_wifi_wait" && (
        <p className="text-xs text-muted-foreground">Connect the car to Wi-Fi to start the download.</p>
      )}
    </div>
  );
}
