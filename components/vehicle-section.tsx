import { VersionChart } from "@/components/version-chart";
import { formatDate, formatDateTime, formatDuration, formatTime } from "@/lib/format";
import type { Snapshot, VehicleView } from "@/lib/server/dashboard";

const STATUS: Record<string, string> = {
  available: "Available",
  scheduled: "Scheduled",
  downloading: "Downloading",
  downloading_wifi_wait: "Waiting for Wi-Fi",
  installing: "Installing",
};

function UpdateStatus({ snapshot }: { snapshot: Snapshot | null }) {
  if (!snapshot) return <p className="text-muted-foreground">Unknown until the car is next seen online.</p>;
  const status = snapshot.update_status;
  if (!status || !STATUS[status]) return <p>No update pending</p>;

  const progress =
    status === "installing" ? snapshot.install_perc : status.startsWith("downloading") ? snapshot.download_perc : null;
  return (
    <div className="space-y-2">
      <p>
        {status === "available" ? (
          <span className="inline-flex items-center gap-2 text-positive">
            <span className="relative flex size-2" aria-hidden="true">
              <span className="absolute inline-flex size-full rounded-full bg-positive opacity-60 motion-safe:animate-ping" />
              <span className="relative inline-flex size-2 rounded-full bg-positive" />
            </span>
            {STATUS[status]}
          </span>
        ) : (
          STATUS[status]
        )}
        {snapshot.update_version && <span className="ml-2 font-mono text-muted-foreground">{snapshot.update_version}</span>}
      </p>
      {progress != null && (
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border">
            <div className="h-px bg-foreground" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
          </div>
          <span className="w-10 text-right font-mono text-xs tabular-nums text-muted-foreground">{progress}%</span>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {status === "scheduled" && snapshot.scheduled_time_ms
          ? `Starts ${formatDateTime(snapshot.scheduled_time_ms)}`
          : snapshot.expected_duration_sec
            ? `Install takes about ${formatDuration(snapshot.expected_duration_sec)}`
            : null}
      </p>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <dt className="mb-1 text-xs text-faint">{children}</dt>;
}

export function VehicleSection({ view }: { view: VehicleView }) {
  const { vehicle, latest, lastOnline, history } = view;
  const asleep = latest && latest.state !== "online";

  return (
    <section className="space-y-12">
      <header className="space-y-1">
        <h2 className="text-sm text-muted-foreground">
          {vehicle.display_name || "Tesla"}
          {asleep && <span className="ml-2 text-faint">· {latest.state === "offline" ? "Offline" : "Asleep"}</span>}
        </h2>
        <p className="font-mono text-4xl font-medium tracking-tight tabular-nums sm:text-4xl">
          {vehicle.current_version ?? "—"}
        </p>
        {!vehicle.current_version && (
          <p className="text-sm text-muted-foreground">
            The car has been asleep at every check so far. Its version shows up the next time it is online during a check.
          </p>
        )}
      </header>

      <dl className="grid gap-8 text-sm sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Label>Update</Label>
          <dd>
            <UpdateStatus snapshot={lastOnline} />
            {asleep && lastOnline && (
              <p className="mt-1 text-xs text-faint">As of {formatDateTime(lastOnline.polled_at)}</p>
            )}
          </dd>
        </div>
        <div>
          <Label>Last seen online</Label>
          <dd>
            {vehicle.last_seen_at ? (
              <>
                {formatTime(vehicle.last_seen_at)}
                <span className="block text-xs text-muted-foreground">{formatDate(vehicle.last_seen_at)}</span>
              </>
            ) : (
              <span className="text-muted-foreground">Not yet</span>
            )}
          </dd>
        </div>
      </dl>

      {latest?.error && <p className="text-xs text-muted-foreground">Last check: {latest.error}</p>}

      <div className="space-y-4">
        <h3 className="text-xs text-faint">History</h3>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No versions recorded yet.</p>
        ) : (
          <>
            <VersionChart changes={[...history].reverse()} until={vehicle.last_polled_at} />
            <ol className="text-sm">
              {history.map((change) => (
                <li key={change.detected_at} className="flex items-baseline justify-between gap-4 border-t py-2.5">
                  <span className="font-mono">{change.version}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {change.previous_version ? formatDate(change.detected_at) : `First seen ${formatDate(change.detected_at)}`}
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </section>
  );
}
