import { VersionChart } from "@/components/version-chart";
import { formatDate, formatDateTime, formatDuration, formatTime } from "@/lib/format";
import { ChevronRight, Sparkles } from "lucide-react";
import { changeCount, ReleaseNotesList } from "@/components/release-notes";
import type { ReleaseNotesByVersion } from "@/lib/release-notes";
import type { Snapshot, VehicleView } from "@/lib/server/dashboard";

const STATUS: Record<string, string> = {
  available: "Available",
  scheduled: "Scheduled",
  downloading: "Downloading",
  downloading_wifi_wait: "Waiting for Wi-Fi",
  installing: "Installing",
};

function WhatsNew({ version, notes }: { version: string; notes: ReleaseNotesByVersion }) {
  if (!notes[version]) return null;
  return (
    <details className="group/notes">
      <summary
        aria-label={`What's new in ${version}, ${changeCount(notes[version].length)}`}
        className="flex w-fit list-none items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden"
      >
        <Sparkles className="size-3" aria-hidden="true" />
        What&apos;s new
        <span className="text-faint">· {changeCount(notes[version].length)}</span>
        <ChevronRight className="size-3 text-faint transition-transform group-open/notes:rotate-90" aria-hidden="true" />
      </summary>
      <ReleaseNotesList notes={notes[version]} />
    </details>
  );
}

// Order: status line, its details (progress, timing, "as of"), then release notes last.
function UpdateStatus({
  snapshot,
  notes,
  asOf,
}: {
  snapshot: Snapshot | null;
  notes: ReleaseNotesByVersion;
  asOf: string | null;
}) {
  if (!snapshot) return <p className="text-muted-foreground">Unknown until the car is next seen online.</p>;
  const status = snapshot.update_status;
  const asOfLine = asOf && <p className="text-xs text-faint">As of {formatDateTime(asOf)}</p>;
  if (!status || !STATUS[status]) {
    return (
      <div className="space-y-1">
        <p>Up to date</p>
        {asOfLine}
      </div>
    );
  }

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
              <span className="absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-background/50 to-transparent motion-safe:animate-shimmer" />
            </div>
          </div>
          <span className="w-10 text-right font-mono text-xs tabular-nums text-muted-foreground">{progress}%</span>
        </div>
      )}
      {(status === "scheduled" && snapshot.scheduled_time_ms) || snapshot.expected_duration_sec ? (
        <p className="text-xs text-muted-foreground">
          {status === "scheduled" && snapshot.scheduled_time_ms
            ? `Starts ${formatDateTime(snapshot.scheduled_time_ms)}`
            : `Install takes ~${formatDuration(snapshot.expected_duration_sec!)}`}
        </p>
      ) : null}
      {asOfLine}
      {snapshot.update_version && <WhatsNew version={snapshot.update_version} notes={notes} />}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <dt className="mb-1 text-xs text-faint">{children}</dt>;
}

export function VehicleSection({ view, notes = {} }: { view: VehicleView; notes?: ReleaseNotesByVersion }) {
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
        {vehicle.current_version && (
          <div className="pt-2">
            <WhatsNew version={vehicle.current_version} notes={notes} />
          </div>
        )}
        {!vehicle.current_version && (
          <p className="text-sm text-muted-foreground">
            Asleep at every check so far. Open the Tesla app to wake the car, then select Check now.
          </p>
        )}
      </header>

      <dl className="grid gap-8 text-sm sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Label>Update</Label>
          <dd>
            <UpdateStatus snapshot={lastOnline} notes={notes} asOf={asleep && lastOnline ? lastOnline.polled_at : null} />
          </dd>
        </div>
        <div className="sm:text-right">
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

      {latest?.error && (
        <p className="text-xs text-muted-foreground">The car went to sleep during the last check. Uplink will try again.</p>
      )}

      <div className="space-y-4">
        <h3 className="text-xs text-faint">History</h3>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No versions recorded yet.</p>
        ) : (
          <>
            <VersionChart changes={[...history].reverse()} until={vehicle.last_polled_at} />
            <ol className="text-sm">
              {history.map((change) => {
                const date = change.previous_version ? formatDate(change.detected_at) : `First seen ${formatDate(change.detected_at)}`;
                const versionNotes = notes[change.version];
                if (!versionNotes) {
                  return (
                    <li key={change.detected_at} className="flex items-baseline justify-between gap-4 border-t py-2.5 pl-5">
                      <span className="font-mono">{change.version}</span>
                      <span className="text-muted-foreground tabular-nums">{date}</span>
                    </li>
                  );
                }
                return (
                  <li key={change.detected_at} className="border-t">
                    <details className="group/row">
                      <summary
                        aria-label={`${change.version}, ${date}. Show release notes`}
                        className="flex list-none items-baseline justify-between gap-4 py-2.5 hover:text-foreground [&::-webkit-details-marker]:hidden"
                      >
                        <span className="flex items-center gap-1.5 font-mono">
                          <ChevronRight
                            className="size-3.5 self-center text-faint transition-transform group-open/row:rotate-90"
                            aria-hidden="true"
                          />
                          {change.version}
                        </span>
                        <span className="text-muted-foreground tabular-nums">{date}</span>
                      </summary>
                      <div className="pb-4 pl-5">
                        <ReleaseNotesList notes={versionNotes} />
                      </div>
                    </details>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </div>
    </section>
  );
}
