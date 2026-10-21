import type { Metadata } from "next";
import Link from "next/link";
import { cacheLife, cacheTag } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { Logo } from "@/components/logo";
import { Vin } from "@/components/vin";
import { formatSeen } from "@/lib/format";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { type CarDetails, loadCarDetails } from "@/lib/server/car";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";

export const metadata: Metadata = { title: "Car · Uplink" };

const km = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

function Header() {
  return (
    <header className="mb-16 flex items-center justify-between gap-4 text-sm">
      <Link href="/" prefetch={true} className="flex items-center gap-2.5 font-medium">
        <Logo className="size-5" />
        Uplink
      </Link>
      <nav aria-label="Main" className="flex items-baseline gap-4 text-muted-foreground">
        <Link href="/" prefetch={true} className="hover:text-foreground">
          Dashboard
        </Link>
        <Link href="/stats" prefetch={true} className="hover:text-foreground">
          Stats
        </Link>
        <Link href="/settings" prefetch={true} className="hover:text-foreground">
          Settings
        </Link>
      </nav>
    </header>
  );
}

// Session check plus data in one browser-only private cache, like the other pages (see app/page.tsx).
async function loadCar(id: string): Promise<{ car: CarDetails | null; now: number }> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  // The clock is read inside the cache; reading it while rendering blocks prerendering.
  return { car: await loadCarDetails(id), now: Date.now() };
}

const yesNo = (v: boolean | null) => (v === null ? null : v ? "Yes" : "No");

// A labelled group of rows; rows with no value are left out rather than shown as blanks.
function Group({ title, rows }: { title: string; rows: [string, ReactNode][] }) {
  const shown = rows.filter(([, value]) => value !== null && value !== undefined && value !== false && value !== "");
  if (shown.length === 0) return null;
  return (
    <section>
      <h2 className="text-xs tracking-wide text-faint uppercase">{title}</h2>
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

async function Car({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { car, now } = await loadCar(id);
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
            ["VIN", car.vin && <Vin vin={car.vin} />],
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
        {!car.checkedAt && (
          <p className="text-sm text-muted-foreground">
            The details fill in after a check that finds the car awake. Open the Tesla app, then refresh on the dashboard.
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

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-12 sm:py-20">
      <Header />
      <Suspense fallback={<CarSkeleton />}>
        <Car params={params} />
      </Suspense>
    </div>
  );
}
