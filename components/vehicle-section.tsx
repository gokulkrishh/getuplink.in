import { VersionChart } from "@/components/version-chart";
import { formatDate, formatDateTime, formatDuration, formatKm, formatSeen, formatShortDate } from "@/lib/format";
import { Check, ChevronRight, Zap } from "lucide-react";
import { ReleaseNotesList } from "@/components/release-notes";
import type { ReleaseNotesByVersion } from "@/lib/release-notes";
import type { Snapshot, VehicleView, VersionChange } from "@/lib/server/dashboard";

const STATUS: Record<string, string> = {
  available: "Available",
  scheduled: "Scheduled",
  downloading: "Downloading",
  downloading_wifi_wait: "Waiting for Wi-Fi",
  installing: "Installing",
};

function ReleaseNotesToggle({ version, notes }: { version: string; notes: ReleaseNotesByVersion }) {
  if (!notes[version]) return null;
  return (
    <details className="group/notes">
      <summary
        aria-label={`Release notes for ${version}`}
        className="flex w-fit list-none items-center gap-1.5 text-xs text-muted-foreground group-open/notes:text-foreground hover:text-foreground [&::-webkit-details-marker]:hidden"
      >
        Release notes
        <ChevronRight className="size-3 text-faint transition-transform group-open/notes:rotate-90" aria-hidden="true" />
      </summary>
      <ReleaseNotesList notes={notes[version]} />
    </details>
  );
}

// Order: status line, then its details (progress, timing, "as of"). Release notes render below, full width.
function UpdateStatus({ snapshot, asOf }: { snapshot: Snapshot | null; asOf: string | null }) {
  if (!snapshot) return <p className="text-muted-foreground">Unknown until the car is next seen online.</p>;
  const status = snapshot.update_status;
  const asOfLine = asOf && <p className="text-xs text-faint">As of {formatDateTime(asOf)}</p>;
  if (!status || !STATUS[status]) {
    return (
      <div className="space-y-1">
        <p className="flex items-center gap-1.5">
          <Check className="size-3.5 text-muted-foreground" aria-hidden="true" />
          Up to date
        </p>
        {asOfLine}
      </div>
    );
  }

  const progress =
    status === "installing" ? snapshot.install_perc : status === "downloading" ? snapshot.download_perc : null;
  return (
    <div className="space-y-2">
      <p>
        {status === "available" ? (
          <span className="inline-flex items-center gap-2 text-foreground">
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
              <span className="absolute inset-y-0 -left-1/2 w-1/2 bg-linear-to-r from-transparent via-background/50 to-transparent motion-safe:animate-shimmer" />
            </div>
          </div>
          <span className="w-10 text-right font-mono text-xs tabular-nums text-muted-foreground">{progress}%</span>
        </div>
      )}
      {(status === "scheduled" && snapshot.scheduled_time_ms) || snapshot.expected_duration_sec ? (
        <p className="text-xs text-muted-foreground">
          {status === "scheduled" && snapshot.scheduled_time_ms
            ? `Starts ${formatDateTime(snapshot.scheduled_time_ms)}`
            : `Takes approx. ~${formatDuration(snapshot.expected_duration_sec!)}`}
        </p>
      ) : null}
      {status === "downloading_wifi_wait" && (
        <p className="text-xs text-muted-foreground">Connect the car to Wi-Fi to start the download.</p>
      )}
      {asOfLine}
    </div>
  );
}

// Right side of a history row: when the version arrived, plus when it was offered and the odometer.
function HistoryMeta({ change, date }: { change: VersionChange; date: string | null }) {
  const details = [
    change.available_at && `Offered ${formatShortDate(change.available_at)}`,
    change.odometer_km != null && formatKm(change.odometer_km),
  ].filter(Boolean);
  return (
    <div className="text-right gap-1 flex flex-col">
      {date ? (
        <span className="block text-muted-foreground tabular-nums">{date}</span>
      ) : (
        <span className="block text-faint" title="Install date unknown: this version was already on the car when Uplink started tracking.">
          —
        </span>
      )}
      {details.length > 0 && <span className="block text-xs text-faint tabular-nums">{details.join(" · ")}</span>}
    </div>
  );
}

// Battery as a readable gauge: big %, range beside it, a thin bar with a tick at the charge limit.
function BatteryGauge({ snapshot }: { snapshot: Snapshot }) {
  const level = Math.min(100, Math.max(0, snapshot.battery_level ?? 0));
  const limit = snapshot.charge_limit != null ? Math.min(100, Math.max(0, snapshot.charge_limit)) : null;
  const charging = snapshot.charging_state === "Charging";
  return (
    <div className="space-y-2">
      <p className="flex items-baseline gap-2">
        <span className="font-mono text-2xl font-medium tracking-tight tabular-nums">{level}%</span>
        {snapshot.battery_range_km != null && (
          <span className="text-sm text-muted-foreground tabular-nums">{formatKm(snapshot.battery_range_km)}</span>
        )}
      </p>
      <div
        role="meter"
        aria-valuenow={level}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Battery ${level}%${limit != null ? `, limit ${limit}%` : ""}`}
        className="relative h-1 max-w-sm bg-border"
      >
        <div className="relative h-full overflow-hidden bg-foreground" style={{ width: `${level}%` }}>
          {charging && (
            <span className="absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-background/50 to-transparent motion-safe:animate-shimmer" />
          )}
        </div>
        {limit != null && (
          <span aria-hidden="true" className="absolute -top-1 h-3 w-px bg-muted-foreground" style={{ left: `${limit}%` }} />
        )}
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {charging && <Zap className="size-3" aria-hidden="true" />}
        {charging ? `Charging to ${limit ?? 100}%` : limit != null ? `Limit ${limit}%` : null}
      </p>
    </div>
  );
}

// Empty history: a faint dashed preview of the chart, then what will fill it and how to start.
function EmptyHistory() {
  return (
    <div className="space-y-4">
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
      <div className="space-y-1">
        <p className="text-sm">No versions yet</p>
        <p className="max-w-md text-xs text-muted-foreground">
          Uplink records each software version the first time it sees the car online.
        </p>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <dt className="mb-1 text-xs text-faint">{children}</dt>;
}

export function VehicleSection({ view, notes = {} }: { view: VehicleView; notes?: ReleaseNotesByVersion }) {
  const { vehicle, latest, lastOnline, history } = view;
  const asleep = latest && latest.state !== "online";
  const pending = Boolean(lastOnline?.update_status && STATUS[lastOnline.update_status]);
  // "Model Y, Pearl White", without repeating the model when the car is already named after it.
  const carLabel = [vehicle.model !== vehicle.display_name && vehicle.model, vehicle.exterior_color].filter(Boolean).join(", ");
  // Battery is only known from a poll taken while the car was online.
  const battery = lastOnline?.battery_level != null ? lastOnline : null;

  return (
    <section className="space-y-12">
      <header className="space-y-1">
        <h2 className="text-sm text-muted-foreground">
          {vehicle.display_name || "Tesla"}
          {carLabel && <span className="ml-2 text-faint">· {carLabel}</span>}
          {!pending && lastOnline && <span className="ml-2 text-faint">· Up to date</span>}
          {asleep && <span className="ml-2 text-faint">· {latest.state === "offline" ? "Offline" : "Asleep"}</span>}
          <span className="ml-2 text-faint">
            · {vehicle.last_seen_at ? `Seen ${formatSeen(vehicle.last_seen_at)}` : "Not seen online yet"}
          </span>
        </h2>
        <p className="font-mono text-4xl font-medium tracking-tight tabular-nums sm:text-4xl">
          {vehicle.current_version ?? "—"}
        </p>
        {vehicle.current_version && (
          <div className="pt-2">
            <ReleaseNotesToggle version={vehicle.current_version} notes={notes} />
          </div>
        )}
        {!vehicle.current_version && (
          <p className="text-sm text-muted-foreground">
            Asleep at every check so far. Open the Tesla app to wake the car, then select Check now.
          </p>
        )}
      </header>

      {(pending || !lastOnline || battery) && (
        // Update and Battery side by side; whichever applies alone takes the left half.
        <dl className="grid gap-8 text-sm sm:grid-cols-2">
          {(pending || !lastOnline) && (
            <div>
              <Label>Update</Label>
              <dd>
                <UpdateStatus snapshot={lastOnline} asOf={asleep && lastOnline ? lastOnline.polled_at : null} />
              </dd>
            </div>
          )}
          {battery && (
            <div>
              <Label>Battery</Label>
              <dd>
                <BatteryGauge snapshot={battery} />
              </dd>
            </div>
          )}
        </dl>
      )}

      {pending && lastOnline?.update_version && notes[lastOnline.update_version] && (
        <div className="-mt-6">
          <ReleaseNotesToggle version={lastOnline.update_version} notes={notes} />
        </div>
      )}

      {latest?.error && (
        <p className="text-xs text-muted-foreground">The car went to sleep during the last check. Uplink will try again.</p>
      )}

      <div className="space-y-4">
        <h3 className="text-xs text-faint">History</h3>
        {history.length === 0 ? (
          <EmptyHistory />
        ) : (
          <>
            <VersionChart changes={[...history].reverse()} until={vehicle.last_polled_at} />
            <ol className="text-sm">
              {history.map((change) => {
                // The first version was already installed when tracking began; Tesla doesn't report install dates.
                const date = change.previous_version ? formatDate(change.detected_at) : null;
                const versionNotes = notes[change.version];
                if (!versionNotes) {
                  return (
                    <li key={change.detected_at} className="flex items-baseline justify-between gap-4 border-t py-2.5 pl-5">
                      <span className="font-mono">{change.version}</span>
                      <HistoryMeta change={change} date={date} />
                    </li>
                  );
                }
                return (
                  <li key={change.detected_at} className="border-t">
                    <details className="group/row">
                      <summary
                        aria-label={`${change.version}, ${date ?? "install date unknown"}. Show release notes`}
                        className="flex list-none items-baseline justify-between gap-4 py-2.5 hover:text-foreground [&::-webkit-details-marker]:hidden"
                      >
                        <span className="flex items-center gap-1.5 font-mono">
                          <ChevronRight
                            className="size-3.5 self-center text-faint transition-transform group-open/row:rotate-90"
                            aria-hidden="true"
                          />
                          {change.version}
                        </span>
                        <HistoryMeta change={change} date={date} />
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
