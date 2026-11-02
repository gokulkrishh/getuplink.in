import { AutoRefresh } from "@/components/auto-refresh";
import { BatteryGauge } from "@/components/battery-gauge";
import { AWAKE_MS, CarStatus } from "@/components/car-status";
import { UpdateBanner } from "@/components/updates/update-banner";
import type { ParkedNow } from "@/lib/drives";
import type { HomeCar } from "@/lib/server/home";
import { currentVersion } from "@/lib/versions";

// The car right now: name and status, then the battery as the biggest thing on the page with what the
// car is doing under it, then its software (version, odometer, any update) in a card that opens /updates.
// `odometerKm` and `parkedNow` are known for the primary car only; "pending" while parkedNow still loads.
// `holdRow`: the parked line was pending, so its row stays once loaded (see BatteryGauge).
// `recent`: the primary car's last drive and charge of the day, closing the strip under the battery (full
// width, so a line rarely wraps): a slot the page fills with <Recently> in its own Suspense, so the strip
// itself never waits for the week's read (app/page.tsx). Empty, it takes no space.
export function NowStrip({
  car,
  odometerKm,
  parkedNow,
  now,
  holdRow = false,
  recent = null,
}: {
  car: HomeCar;
  odometerKm: number | null;
  parkedNow: ParkedNow | null | "pending";
  now: number;
  holdRow?: boolean;
  recent?: React.ReactNode;
}) {
  const { vehicle, latest, lastOnline, streamAt } = car;
  // A car that streamed in the last few minutes is awake: keep the page fresh so new data shows up on its own.
  const awake = streamAt !== null && now - Date.parse(streamAt) < AWAKE_MS;
  // "Model Y, Pearl White", without repeating the model when the car is already named after it.
  const carLabel = [vehicle.model !== vehicle.display_name && vehicle.model, vehicle.exterior_color].filter(Boolean).join(", ");
  // Battery is only known from a poll taken while the car was online.
  const battery = lastOnline?.battery_level != null ? lastOnline : null;
  const version = currentVersion(vehicle.current_version, lastOnline && { version: lastOnline.car_version, at: lastOnline.polled_at });
  return (
    // One row from sm up: who the car is, what it runs and when it last synced on the left; the battery on
    // the right. On a phone the battery follows under them. The last drive and charge close the strip.
    // From sm up it sits in a card, the first of the page's cards.
    <section aria-label="Your car now" className="flex flex-col gap-5 sm:rounded-xl sm:border sm:bg-background sm:p-5 sm:shadow-xs lg:p-6 dark:sm:bg-card dark:sm:shadow-none">
      {awake && <AutoRefresh />}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
      <div className="min-w-0 space-y-1 sm:flex-1">
        {/* Plain text: the header's Car link already opens the car's page. */}
        <h2 className="truncate text-sm">
          <span className="font-medium text-foreground">{vehicle.display_name || "Tesla"}</span>
          {carLabel && <span className="text-muted-foreground"> · {carLabel}</span>}
        </h2>
        <UpdateBanner snapshot={lastOnline} installed={vehicle.current_version} version={version} odometerKm={odometerKm} />
        <p className="text-sm text-faint tabular-nums">
          {/* A recent streamed reading means the car is awake now, even between checks. */}
          <CarStatus
            state={latest?.state ?? null}
            streaming={awake}
            seenAt={streamAt && (!vehicle.last_seen_at || Date.parse(streamAt) > Date.parse(vehicle.last_seen_at)) ? streamAt : vehicle.last_seen_at}
            checkedAt={latest?.polled_at ?? null}
            now={now}
          />
        </p>
        {!version && <p className="text-sm text-muted-foreground">Asleep at every check so far. Open the Tesla app to wake the car. This page updates by itself.</p>}
      </div>
      {battery && <BatteryGauge snapshot={battery} parked={parkedNow} now={now} align="end" sentry={car.sentry} holdRow={holdRow} />}
      </div>
      {recent && <div className="space-y-1 empty:hidden">{recent}</div>}
    </section>
  );
}
