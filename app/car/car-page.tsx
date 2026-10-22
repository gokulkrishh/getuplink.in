import { cacheLife, cacheTag } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { Header } from "@/components/header";
import { Vin } from "@/components/vin";
import { formatDate, formatSeen } from "@/lib/format";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { type CarDetails, loadCarDetails } from "@/lib/server/car";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { loadPrimaryVehicle } from "@/lib/server/telemetry";

const km = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

// Session check plus data in one browser-only private cache, like the other pages (see app/page.tsx).
// A null id is the primary car (/car), so the header's Car link needs no data.
async function loadCar(id: string | null): Promise<{ car: CarDetails | null; now: number }> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  const carId = id ?? (await loadPrimaryVehicle())?.id ?? null;
  // The clock is read inside the cache; reading it while rendering blocks prerendering.
  return { car: carId ? await loadCarDetails(carId) : null, now: Date.now() };
}

const yesNo = (v: boolean | null) => (v === null ? null : v ? "Yes" : "No");

// A labelled group of rows; rows with no value are left out rather than shown as blanks.
function Group({ title, rows }: { title: string; rows: [string, ReactNode][] }) {
  const shown = rows.filter(([, value]) => value !== null && value !== undefined && value !== false && value !== "");
  if (shown.length === 0) return null;
  return (
    <section>
      <h2 className="text-xs tracking-wide text-foreground uppercase">{title}</h2>
      <dl className="mt-3 divide-y border-y text-sm">
        {shown.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-4 py-3">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

async function Car({ id }: { id: Promise<string | null> }) {
  const carId = await id;
  const { car, now } = await loadCar(carId);
  if (!car && carId === null) return <p className="text-sm text-muted-foreground">No car on your Tesla account yet.</p>;
  if (!car) notFound();

  return (
    <>
      <h1 className="text-2xl font-medium tracking-heading">{car.name}</h1>
      <p className="mt-2 mb-12 text-sm text-muted-foreground">
        {[car.year, car.model, car.generation && `(${car.generation})`].filter(Boolean).join(" ")}
      </p>
      <div className="flex flex-col gap-12">
        <Group
          title="Car"
          rows={[
            ["Model", car.model],
            ["Model year", car.year],
            ["Drive", car.drive],
            ["Built in", car.factory],
            ["VIN", car.vin && <Vin vin={car.vin} label={false} />],
          ]}
        />
        <Group
          title="Look"
          rows={[
            ["Paint", car.paint],
            ["Wheels", car.wheels],
            ["Roof", car.roof],
            ["Interior", car.interior],
          ]}
        />
        <Group
          title="Features"
          rows={[
            ["Driver assistance", car.hardware],
            ["Charge port", car.chargePort],
            ["Steering", car.steering],
            ["Ventilated front seats", yesNo(car.seatCooling)],
            ["Heated rear seats", yesNo(car.rearSeatHeaters)],
            ["Air suspension", yesNo(car.airSuspension)],
          ]}
        />
        <Group
          title="Latest check"
          rows={[
            ["Software", car.version && <span className="font-mono">{car.version}</span>],
            ["Odometer", car.odometerKm !== null && `${km.format(car.odometerKm)} km`],
            [
              "Battery",
              car.batteryLevel !== null &&
                `${car.batteryLevel}%${car.rangeKm !== null ? ` · ${km.format(car.rangeKm)} km` : ""}`,
            ],
            ["Charge limit", car.chargeLimit !== null && `${car.chargeLimit}%`],
            ["Checked", car.checkedAt && formatSeen(car.checkedAt, now)],
          ]}
        />
        {car.battery && (
          <Group
            title="Battery health"
            rows={[
              ["Estimated full pack", `${car.battery.packKwh.toFixed(1)} kWh`],
              [
                "Based on",
                `${new Intl.PluralRules("en-IN").select(car.battery.readings) === "one" ? "1 reading" : `${car.battery.readings} readings`} since ${formatDate(car.battery.since)}`,
              ],
            ]}
          />
        )}
        {car.lastAcCharge && (
          <Group
            title="Last AC charge"
            rows={[
              ["Charger", car.lastAcCharge.charger],
              ["Cable", car.lastAcCharge.cable],
            ]}
          />
        )}
        {!car.checkedAt && (
          <p className="text-sm text-muted-foreground">
            The details need a check that finds the car awake. Open the Tesla app; the details fill in on their own.
          </p>
        )}
      </div>
    </>
  );
}

function CarSkeleton() {
  const block = "bg-muted motion-safe:animate-pulse";
  return (
    <div role="status" className="flex flex-col gap-12">
      <span className="sr-only">Loading…</span>
      <div className={`h-8 w-40 ${block}`} />
      <div className={`h-48 w-full ${block}`} />
      <div className={`h-40 w-full ${block}`} />
    </div>
  );
}

// /car/[id] and /car (the primary car, id null) render this.
export function CarPage({ id }: { id: Promise<string | null> }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-12 sm:py-20">
      <Header current="car" />
      <Suspense fallback={<CarSkeleton />}>
        <Car id={id} />
      </Suspense>
    </div>
  );
}
