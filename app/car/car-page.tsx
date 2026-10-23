import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { cacheLife, cacheTag } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { Header } from "@/components/header";
import { Vin } from "@/components/vin";
import { CAR_NOW_FIELDS, type CarNow, carNow } from "@/lib/car-now";
import { formatClock, formatShortDate } from "@/lib/format";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { type CarDetails, loadCarDetails } from "@/lib/server/car";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { loadPrimaryVehicle, loadStream } from "@/lib/server/telemetry";

// Session check plus data in one browser-only private cache, like the other pages (see app/page.tsx).
// A null id is the primary car (/car), so the header's Car link needs no data.
async function loadCar(id: string | null): Promise<CarDetails | null> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  const carId = id ?? (await loadPrimaryVehicle())?.id ?? null;
  return carId ? loadCarDetails(carId) : null;
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

// The car's state now, from the latest streamed readings, in the same private cache as the page.
async function loadNow(vin: string): Promise<CarNow> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  return carNow(await loadStream(vin, CAR_NOW_FIELDS));
}

async function Car({ id }: { id: Promise<string | null> }) {
  const carId = await id;
  const car = await loadCar(carId);
  if (!car && carId === null) return <p className="text-sm text-muted-foreground">No car on your Tesla account yet.</p>;
  if (!car) notFound();
  const now = car.vin ? await loadNow(car.vin) : null;

  return (
    <>
      <h1 className="text-2xl font-medium tracking-heading">{car.name}</h1>
      <p className="mt-2 mb-12 text-sm text-muted-foreground">
        {[car.year, car.model, car.generation && `(${car.generation})`].filter(Boolean).join(" ")}
      </p>
      <div className="flex flex-col gap-12">
        {now && now.rows.length > 0 && (
          <div className="space-y-3">
            <Group title="Car now" rows={now.rows} />
            {now.since && <p className="text-xs text-faint">Last update {formatShortDate(now.since)}, {formatClock(now.since)}</p>}
          </div>
        )}
        {now && now.tyres.length > 0 && (
          <div className="space-y-3">
            <Group title="Tyres" rows={now.tyres} />
            {now.tyreWarning && <p className="text-sm text-destructive">{now.tyreWarning}</p>}
          </div>
        )}
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
            ["Exterior trim", car.exteriorTrim],
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
            ["Recommended tyre pressure", car.tyrePressure],
            [
              "Software",
              car.version && (
                <Link href="/updates" prefetch={true} className="font-mono hover:text-muted-foreground">
                  {car.version}
                </Link>
              ),
            ],
          ]}
        />
        {car.supported.length > 0 && <Group title="Supported" rows={car.supported.map((name) => [name, "Yes"])} />}
        <div className="space-y-3">
          <Group
            title="Battery & drive"
            rows={[
              ["Battery", car.pack],
              // The latest week's estimate, as on /stats/battery; shown once, here.
              [
                "Pack",
                car.battery && (
                  <>
                    ≈{Math.round(car.battery.kwh)} kWh (estimated)
                    <span className="block text-xs text-muted-foreground">
                      {car.battery.readings === 1 ? "1 reading" : `${car.battery.readings} readings`} in the week of{" "}
                      {formatShortDate(car.battery.weekStart)}
                    </span>
                  </>
                ),
              ],
              [
                "Chemistry",
                car.likelyLfp && (
                  <>
                    LFP (likely)
                    <span className="block text-xs text-muted-foreground">Inferred from where it was built and its charging defaults.</span>
                  </>
                ),
              ],
              [
                "Motor",
                car.motor && (
                  <>
                    {car.motor}
                    {car.rearDriveUnit && <span className="ml-2 font-mono text-xs text-muted-foreground">{car.rearDriveUnit}</span>}
                  </>
                ),
              ],
            ]}
          />
          {car.battery && (
            <Link href="/stats/battery" prefetch={true} className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              Battery trend
              <ChevronRight className="size-3" aria-hidden="true" />
            </Link>
          )}
        </div>
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
    <div className="mx-auto w-full max-w-2xl px-5 pt-6 pb-12 sm:pt-8 sm:pb-20">
      <Header />
      <Suspense fallback={<CarSkeleton />}>
        <Car id={id} />
      </Suspense>
    </div>
  );
}
