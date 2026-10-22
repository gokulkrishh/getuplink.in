import Link from "next/link";
import { BatteryHealth, LastCharge, RecentActivity, WeekStrip } from "@/components/vehicle-extras";
import { formatKm, formatTimeToFull } from "@/lib/format";
import { AutoRefresh } from "@/components/auto-refresh";
import { Zap } from "lucide-react";
import { AWAKE_MS, CarStatus } from "@/components/car-status";
import { ReleaseNotesToggle } from "@/components/release-notes";
import { VersionHistory } from "@/components/updates/history";
import { isPending, UpdateStatus } from "@/components/updates/update-status";
import { Vin } from "@/components/vin";
import type { ReleaseNotesByVersion } from "@/lib/release-notes";
import type { Snapshot, VehicleView } from "@/lib/server/dashboard";

const kw = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

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
      {toFull !== null && <p className="text-xs text-muted-foreground tabular-nums">{formatTimeToFull(toFull)}</p>}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <dt className="mb-2 text-xs font-medium tracking-wide text-faint uppercase">{children}</dt>;
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
  const pending = isPending(lastOnline);
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
              <BatteryHealth id={vehicle.id} kwh={extras?.healthKwh ?? null} />
            </dd>
          </div>
        </dl>
      )}

      {extras && <LastCharge item={extras.lastCharge} now={now} />}
      {extras && <RecentActivity events={extras.activity} now={now} />}

      {latest?.error && (
        <p className="text-xs text-muted-foreground">The car went to sleep during the last check. Uplink will try again.</p>
      )}

      <VersionHistory history={history} notes={notes} now={now} until={vehicle.last_polled_at} />
    </section>
  );
}
