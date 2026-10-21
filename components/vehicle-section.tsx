import Link from "next/link";
import { BatteryChart } from "@/components/battery-chart";
import { BatteryHealth, LastCharge, RecentActivity, UpdateSummary, WeekStrip } from "@/components/vehicle-extras";
import { VersionChart } from "@/components/version-chart";
import { formatDate, formatDuration, formatKm, formatSeen, formatShortDate } from "@/lib/format";
import { AutoRefresh } from "@/components/auto-refresh";
import { Check, ChevronRight, Zap } from "lucide-react";
import { ReleaseNotesList } from "@/components/release-notes";
import { ShowMore } from "@/components/show-more";
import { Tip, TipTrigger } from "@/components/tip";
import { Vin } from "@/components/vin";
import { cn } from "@/lib/utils";
import type { ReleaseNotesByVersion } from "@/lib/release-notes";
import type { Snapshot, VehicleView, VersionChange } from "@/lib/server/dashboard";

const AWAKE_MS = 10 * 60 * 1000;

const STATUS: Record<string, string> = {
  available: "Available",
  scheduled: "Scheduled",
  downloading: "Downloading",
  downloading_wifi_wait: "Waiting for Wi-Fi",
  installing: "Installing",
};

function ReleaseNotesToggle({
  version,
  notes,
  stacked = false,
}: {
  version: string;
  notes: ReleaseNotesByVersion;
  stacked?: boolean;
}) {
  if (!notes[version]) return null;
  return (
    <details className="group/notes">
      <summary
        aria-label={`Release notes for ${version}`}
        className="relative flex w-fit list-none items-center gap-1.5 text-xs after:absolute after:-inset-y-2 after:inset-x-0 text-muted-foreground group-open/notes:text-foreground hover:text-foreground [&::-webkit-details-marker]:hidden"
      >
        Release notes
        <ChevronRight className="size-3 text-faint transition-transform group-open/notes:rotate-90" aria-hidden="true" />
      </summary>
      <ReleaseNotesList notes={notes[version]} stacked={stacked} />
    </details>
  );
}

// Order: status line, then its details (progress, timing).
function UpdateStatus({ snapshot, now }: { snapshot: Snapshot | null; now: number }) {
  if (!snapshot) return <p className="text-muted-foreground">Unknown until the car is next seen online.</p>;
  const status = snapshot.update_status;
  if (!status || !STATUS[status]) {
    return (
      <div className="space-y-1">
        <p className="flex items-center gap-1.5">
          <Check className="size-3.5 text-muted-foreground" aria-hidden="true" />
          Up to date
        </p>
      </div>
    );
  }

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
            : `Takes about ${formatDuration(snapshot.expected_duration_sec!)}`}
        </p>
      ) : null}
      {status === "downloading_wifi_wait" && (
        <p className="text-xs text-muted-foreground">Connect the car to Wi-Fi to start the download.</p>
      )}
    </div>
  );
}

// "12 Oct" this year, "24 Dec 2025" otherwise.
function historyDate(value: string, now: number): string {
  return formatDate(value).endsWith(formatDate(now).slice(-4)) ? formatShortDate(value) : formatDate(value);
}

const km = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const kw = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

// Received, installed and odometer cells of a history row.
function HistoryCells({ change, now }: { change: VersionChange; now: number }) {
  // The first version was already installed when tracking began; Tesla doesn't report install dates.
  const date = historyDate(change.detected_at, now);
  return (
    <>
      <span className="hidden text-right text-faint tabular-nums sm:block">
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
            {km.format(change.odometer_km)}
            <span className="ml-0.5 text-xs">km</span>
          </>
        )}</span>
    </>
  );
}

// Battery as a readable gauge: big %, range beside it, a thin bar with a tick at the charge limit.
function BatteryGauge({ snapshot }: { snapshot: Snapshot }) {
  const level = Math.min(100, Math.max(0, snapshot.battery_level ?? 0));
  const limit = snapshot.charge_limit != null ? Math.min(100, Math.max(0, snapshot.charge_limit)) : null;
  const charging = snapshot.charging_state === "Charging";
  const power = charging && snapshot.charge_power_kw != null && snapshot.charge_power_kw > 0 ? snapshot.charge_power_kw : null;
  const toFull = charging && snapshot.time_to_full_h != null && snapshot.time_to_full_h > 0 ? snapshot.time_to_full_h : null;
  const target = limit ?? 100;
  return (
    <div className="space-y-2">
      {/* Streamed power and level move while charging, so the page keeps itself fresh. */}
      {charging && <AutoRefresh />}
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
            <span className="absolute inset-y-0 -left-1/2 w-1/2 bg-linear-to-r from-transparent via-background/50 to-transparent motion-safe:animate-shimmer" />
          )}
        </div>
        {limit != null && (
          <span aria-hidden="true" className="absolute -top-1 h-3 w-px bg-muted-foreground" style={{ left: `${limit}%` }} />
        )}
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {charging && <Zap className="size-3" aria-hidden="true" />}
        {charging
          ? power !== null
            ? `Charging at ${kw.format(power)} kW${level < target ? ` to ${target}%` : ""}`
            : `Charging to ${target}%`
          : limit != null
            ? `Limit ${limit}%`
            : null}
      </p>
      {toFull !== null && <p className="text-xs text-muted-foreground tabular-nums">Full in {formatDuration(toFull * 3600)}</p>}
    </div>
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

const HISTORY_PREVIEW = 5;

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

// "Online" only means something right after a check; older than this shows grey.
const ONLINE_FRESH_MS = 15 * 60 * 1000;

// "● Online" or "● Asleep" as of the last check. When not online, a tooltip says when it last was.
function CarStatus({
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

export function VehicleSection({
  view,
  notes = {},
  now,
}: {
  view: VehicleView;
  notes?: ReleaseNotesByVersion;
  // Render time, taken inside the page's cached loader (see formatSeen).
  now: number;
}) {
  const { vehicle, latest, lastOnline, history, streamAt, extras } = view;
  // A car that streamed in the last few minutes is awake: keep the page fresh so new data shows up on its own.
  const awake = streamAt !== null && now - Date.parse(streamAt) < AWAKE_MS;
  const pending = Boolean(lastOnline?.update_status && STATUS[lastOnline.update_status]);
  // "Model Y, Pearl White", without repeating the model when the car is already named after it.
  const carLabel = [vehicle.model !== vehicle.display_name && vehicle.model, vehicle.exterior_color].filter(Boolean).join(", ");
  // Battery is only known from a poll taken while the car was online.
  const battery = lastOnline?.battery_level != null ? lastOnline : null;

  return (
    <section className="space-y-12">
      {awake && <AutoRefresh />}
      <header className="space-y-1">
        {/* Two columns: car and version on the left; status and VIN on the right. */}
        <div className="grid grid-cols-car-header items-center gap-x-4 gap-y-1">
          <h2 className="text-sm text-muted-foreground">
            {/* The car's name opens its details page. */}
            <Link href={`/car/${vehicle.id}`} prefetch={true} className="transition-colors duration-150 hover:text-foreground">
              {vehicle.display_name || "Tesla"}
              {carLabel && <span className="ml-2 text-faint">· {carLabel}</span>}
            </Link>
          </h2>
          <div className="flex items-center justify-end gap-1 text-sm text-faint tabular-nums">
            {/* A recent streamed reading means the car is awake now, even between checks. */}
            <CarStatus
              state={latest?.state ?? null}
              streaming={awake}
              seenAt={streamAt && (!vehicle.last_seen_at || streamAt > vehicle.last_seen_at) ? streamAt : vehicle.last_seen_at}
              checkedAt={latest?.polled_at ?? null}
              now={now}
            />
          </div>
          <p className="font-mono text-4xl font-medium tracking-tight tabular-nums">
            {vehicle.current_version ?? "—"}
          </p>
          {vehicle.vin && (
            <p className="self-start text-right text-xs text-faint">
              <Vin vin={vehicle.vin} />
            </p>
          )}
        </div>
        {vehicle.current_version && (
          <div className="pt-2">
            <ReleaseNotesToggle version={vehicle.current_version} notes={notes} />
          </div>
        )}
        <UpdateSummary version={vehicle.current_version} history={history} now={now} />
        {!vehicle.current_version && (
          <p className="text-sm text-muted-foreground">
            Asleep at every check so far. Open the Tesla app to wake the car; the dashboard updates on its own.
          </p>
        )}
      </header>

      {(pending || !lastOnline) && (
        <dl className="text-sm">
          <div>
            <Label>Update</Label>
            <dd>
              <UpdateStatus snapshot={lastOnline} now={now} />
              {pending && lastOnline?.update_version && notes[lastOnline.update_version] && (
                <div className="pt-3">
                  <ReleaseNotesToggle version={lastOnline.update_version} notes={notes} stacked />
                </div>
              )}
            </dd>
          </div>
        </dl>
      )}

      <WeekStrip week={extras?.week ?? null} />

      {battery && (
        <dl className="text-sm">
          <div>
            <Label>Battery</Label>
            <dd className="space-y-4">
              <BatteryGauge snapshot={battery} />
              {extras && <BatteryChart day={extras.battery.day} week={extras.battery.week} now={now} />}
              <BatteryHealth id={vehicle.id} kwh={extras?.battery.healthKwh ?? null} />
            </dd>
          </div>
        </dl>
      )}

      {extras && <LastCharge item={extras.lastCharge} now={now} />}
      {extras && <RecentActivity events={extras.activity} now={now} />}

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
            <div className="pt-6">
              <div className={cn("history-cols", "pb-2 text-xs text-faint")}>
                <h3 className="pl-5">Versions</h3>
                <span className="hidden text-right sm:block">Received</span>
                <span className="text-right">Installed</span>
                <span className="text-right">Odometer</span>
              </div>
              <ol className="text-sm">
                {history.slice(0, HISTORY_PREVIEW).map((change) => (
                  <HistoryRow key={change.detected_at} change={change} notes={notes} now={now} />
                ))}
              </ol>
              {history.length > HISTORY_PREVIEW && (
                <ShowMore count={history.length - HISTORY_PREVIEW}>
                  <ol className="text-sm">
                    {history.slice(HISTORY_PREVIEW).map((change) => (
                      <HistoryRow key={change.detected_at} change={change} notes={notes} now={now} />
                    ))}
                  </ol>
                </ShowMore>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
