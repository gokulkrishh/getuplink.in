import Link from "next/link";
import { BatteryHealth, LastCharge, RecentActivity, WeekStrip } from "@/components/vehicle-extras";
import { AutoRefresh } from "@/components/auto-refresh";
import { BatteryGauge } from "@/components/battery-gauge";
import { AWAKE_MS, CarStatus } from "@/components/car-status";
import { ReleaseNotesToggle } from "@/components/release-notes";
import { UpdateBanner } from "@/components/updates/update-banner";
import { Vin } from "@/components/vin";
import type { ReleaseNotesByVersion } from "@/lib/release-notes";
import type { VehicleView } from "@/lib/server/dashboard";

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
  const { vehicle, latest, lastOnline, streamAt, extras } = view;
  // A car that streamed in the last few minutes is awake: keep the page fresh so new data shows up on its own.
  const awake = streamAt !== null && now - Date.parse(streamAt) < AWAKE_MS;
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

      <UpdateBanner snapshot={lastOnline} />

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

    </section>
  );
}
