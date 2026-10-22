import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { redirect } from "next/navigation";
import { Globe } from "lucide-react";
import { Suspense } from "react";
import { EmptyState } from "@/components/empty-state";
import { Header } from "@/components/header";
import { RolloutMap } from "@/components/rollout-map";
import { DEMO } from "@/lib/demo";
import { formatShortDate } from "@/lib/format";
import type { RolloutVersion } from "@/lib/rollout";
import type { Arriving, YourCar } from "@/lib/rollout-arriving";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { loadRollout, type RolloutPage } from "@/lib/server/rollout";

export const metadata: Metadata = { title: "India rollout · Uplink" };

const heading = "text-xs font-medium tracking-wide text-faint uppercase";

// Session check plus data in one browser-only private cache, like the other pages (see app/page.tsx).
async function loadOwnRollout(): Promise<RolloutPage> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  return loadRollout();
}

const cars = (n: number) => `${n} ${n === 1 ? "car" : "cars"}`;
// A release list date is an IST calendar day; noon IST keeps it on that day.
const releaseDay = (day: string) => formatShortDate(`${day}T12:00:00+05:30`);

function lagWords(days: number): string {
  if (days === 0) return "Same day as the world";
  return `${days} ${days === 1 ? "day" : "days"} behind`;
}

// The owner's car against India, in one line.
function yourCarWords(car: YourCar): string {
  if (car.kind === "waiting") return `${car.version} is waiting on your car`;
  if (car.kind === "newest") return "You're on the newest version in India";
  return `You're ${car.versions} ${car.versions === 1 ? "version" : "versions"} behind: ${car.newest} is on ${cars(car.cars)}`;
}

// One version on offer: cars it's waiting on and cars already on it.
function ArrivingRow({ a }: { a: Arriving }) {
  return (
    <li className="flex items-baseline justify-between gap-4 py-3 text-sm tabular-nums">
      <span className="font-mono font-medium">{a.version}</span>
      <span className="text-muted-foreground">
        Offered to {cars(a.offered)} · on {a.on}
      </span>
    </li>
  );
}

// One version: cars on it now with a bar against every counted car, and how its arrival compares with the world.
function VersionRow({ v, counted }: { v: RolloutVersion; counted: number }) {
  return (
    <li className="space-y-2 py-4">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-mono text-sm font-medium tabular-nums">{v.version}</span>
        <span className="text-sm tabular-nums">{cars(v.carsNow)}</span>
      </div>
      <div className="h-1.5 w-full bg-muted" aria-hidden>
        <div className="h-full bg-foreground/70" style={{ width: `${counted ? (v.carsNow / counted) * 100 : 0}%` }} />
      </div>
      {/* Only what's known: a car already on the version when tracking began has no arrival date. */}
      {(v.firstInIndia || v.globalRelease) && (
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
          {v.firstInIndia && <span>First in India {formatShortDate(v.firstInIndia)}</span>}
          {v.globalRelease && <span>Global {releaseDay(v.globalRelease)}</span>}
          {v.lagDays !== null && <span className="text-foreground">{lagWords(v.lagDays)}</span>}
        </p>
      )}
    </li>
  );
}

async function Rollout() {
  const data = await loadOwnRollout();
  if (data.kind === "error") {
    return (
      <section className="space-y-3">
        <h2 className="text-base font-medium tracking-heading">Couldn&apos;t load the rollout</h2>
        <p className="max-w-md font-mono text-xs break-all text-muted-foreground">{data.message}</p>
      </section>
    );
  }
  const { versions, counted, headline } = data.rollout;
  const { states, arriving, yourCar } = data;
  if (versions.length === 0) {
    return (
      <EmptyState icon={<Globe className="size-7 text-faint" aria-hidden="true" />} title="No versions yet">
        Shown once a car reports its version.
      </EmptyState>
    );
  }
  return (
    <div className="space-y-12">
      <header className="space-y-1">
        <h2 className="text-sm text-muted-foreground">Newest in India</h2>
        {headline ? (
          <>
            <p className="font-mono text-4xl font-medium tracking-tight tabular-nums">{headline.version}</p>
            <p className="text-sm text-muted-foreground">
              On {headline.cars} of {cars(headline.of)}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No car runs a reported version right now.</p>
        )}
        {yourCar && <p className="pt-2 text-sm">{yourCarWords(yourCar)}</p>}
      </header>

      {arriving.length > 0 && (
        <section className="space-y-2">
          <h2 className={heading}>Arriving now</h2>
          <ul className="divide-y border-t">
            {arriving.map((a) => (
              <ArrivingRow key={a.version} a={a} />
            ))}
          </ul>
          <p className="text-xs text-faint">Updates Tesla has offered but cars haven&apos;t installed yet, and how many cars already run each.</p>
        </section>
      )}

      <RolloutMap versions={states} />

      <section className="space-y-2">
        <h2 className={heading}>Versions</h2>
        <ul className="divide-y border-t">
          {versions.map((v) => (
            <VersionRow key={v.version} v={v} counted={counted} />
          ))}
        </ul>
      </section>

      <div className="space-y-2 text-xs text-faint">
        <p>
          Pooled across every car Uplink tracks in India. Totals only, never a single car. An offer counts from
          each car&apos;s last check while it was awake.
        </p>
        <p>
          A car&apos;s state comes from its location or, until then, its Superchargers.
        </p>
        <p>Global dates come from a hand-kept list of public first sightings. A version not on it shows the lag as unknown.</p>
        <p>
          State boundaries:{" "}
          <a href="https://github.com/datameet/maps" className="underline underline-offset-2 hover:text-foreground">
            DataMeet India community
          </a>{" "}
          (<a href="https://creativecommons.org/licenses/by/4.0/" className="underline underline-offset-2 hover:text-foreground">CC BY 4.0</a>),
          simplified. Map not to scale.
        </p>
        {DEMO && <p>Demo mode: a simulated fleet of Indian cars, with simulated global dates.</p>}
      </div>
    </div>
  );
}

function RolloutSkeleton() {
  const block = "bg-muted motion-safe:animate-pulse";
  return (
    <div role="status" aria-busy="true" className="space-y-12">
      <span className="sr-only">Loading…</span>
      <div className="space-y-3">
        <div className={`h-4 w-24 ${block}`} />
        <div className={`h-10 w-56 ${block}`} />
        <div className={`h-4 w-32 ${block}`} />
      </div>
      <div className="space-y-4">
        <div className={`h-3 w-16 ${block}`} />
        <div className={`h-32 w-full ${block}`} />
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6 pb-12 sm:pt-8 sm:pb-20">
      <Header current="rollout" />
      <h1 className="sr-only">India rollout</h1>
      <Suspense fallback={<RolloutSkeleton />}>
        <Rollout />
      </Suspense>
    </div>
  );
}
