import Link from "next/link";
import { AutoRefresh } from "@/components/auto-refresh";
import { BatteryGauge } from "@/components/battery-gauge";
import { AWAKE_MS, CarStatus } from "@/components/car-status";
import { formatKm } from "@/lib/format";
import type { HomeCar } from "@/lib/server/home";

// The car right now, in about a header's height: name and status, the battery, the version and the
// odometer. The version's details live on /updates. `odometerKm` is known for the primary car only.
export function NowStrip({ car, odometerKm, now }: { car: HomeCar; odometerKm: number | null; now: number }) {
  const { vehicle, latest, lastOnline, streamAt } = car;
  // A car that streamed in the last few minutes is awake: keep the page fresh so new data shows up on its own.
  const awake = streamAt !== null && now - Date.parse(streamAt) < AWAKE_MS;
  // "Model Y, Pearl White", without repeating the model when the car is already named after it.
  const carLabel = [vehicle.model !== vehicle.display_name && vehicle.model, vehicle.exterior_color].filter(Boolean).join(", ");
  // Battery is only known from a poll taken while the car was online.
  const battery = lastOnline?.battery_level != null ? lastOnline : null;
  return (
    <section aria-label="Your car now" className="space-y-4">
      {awake && <AutoRefresh />}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <h2 className="min-w-0 truncate text-sm text-muted-foreground">
          <Link href={`/car/${vehicle.id}`} prefetch={true} className="transition-colors duration-150 hover:text-foreground">
            {vehicle.display_name || "Tesla"}
            {carLabel && <span className="ml-2 text-faint">· {carLabel}</span>}
          </Link>
        </h2>
        <p className="shrink-0 text-sm text-faint tabular-nums">
          {/* A recent streamed reading means the car is awake now, even between checks. */}
          <CarStatus
            state={latest?.state ?? null}
            streaming={awake}
            seenAt={streamAt && (!vehicle.last_seen_at || Date.parse(streamAt) > Date.parse(vehicle.last_seen_at)) ? streamAt : vehicle.last_seen_at}
            checkedAt={latest?.polled_at ?? null}
            now={now}
          />
        </p>
      </div>
      {battery && <BatteryGauge snapshot={battery} />}
      {vehicle.current_version ? (
        <p className="text-sm text-muted-foreground tabular-nums">
          <Link href="/updates" prefetch={true} className="font-mono transition-colors duration-150 hover:text-foreground">
            {vehicle.current_version}
          </Link>
          {odometerKm !== null && <span> · {formatKm(odometerKm)}</span>}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Asleep at every check so far. Open the Tesla app to wake the car; this page updates on its own.
        </p>
      )}
    </section>
  );
}
