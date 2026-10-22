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
import { MIN_GROUP, type RolloutVersion } from "@/lib/rollout";
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

function lagWords(days: number | null): string {
  if (days === null) return "Lag unknown";
  if (days === 0) return "Same day as the world";
  return `${days} ${days === 1 ? "day" : "days"} behind`;
}

// One version: cars on it now with a bar against every counted car, and how its arrival compares with the world.
function VersionRow({ v, counted }: { v: RolloutVersion; counted: number }) {
  return (
    <li className="space-y-2 py-4">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-mono text-sm font-medium tabular-nums">{v.version}</span>
        <span className={v.shown ? "text-sm tabular-nums" : "text-sm text-faint"}>{v.shown ? cars(v.carsNow) : `Fewer than ${MIN_GROUP} cars`}</span>
      </div>
      {v.shown && (
        <div className="h-1.5 w-full bg-muted" aria-hidden>
          <div className="h-full bg-foreground/70" style={{ width: `${counted ? (v.carsNow / counted) * 100 : 0}%` }} />
        </div>
      )}
      {v.shown && (
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
          <span>First in India {v.firstInIndia ? formatShortDate(v.firstInIndia) : "unknown"}</span>
          <span>Global {v.globalRelease ? releaseDay(v.globalRelease) : "unknown"}</span>
          <span className="text-foreground">{lagWords(v.lagDays)}</span>
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
  const { states } = data;
  if (versions.length === 0) {
    return (
      <EmptyState icon={<Globe className="size-7 text-faint" aria-hidden="true" />} title="No versions yet">
        Shown once {MIN_GROUP} cars report a version.
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
          <p className="text-sm text-muted-foreground">Shown once {MIN_GROUP} cars report a version.</p>
        )}
      </header>

      {states.length > 0 && (
        <section className="space-y-2">
          <h2 className={heading}>Where it runs</h2>
          <RolloutMap versions={states} />
        </section>
      )}

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
          Pooled across every car Uplink tracks in India. Totals only: a version&apos;s numbers show once {MIN_GROUP} cars report it, and cars on
          a version with fewer are left out of every total.
        </p>
        <p>
          A state shows once {MIN_GROUP} cars there run the version. Smaller states are pooled by region when the region has{" "}
          {MIN_GROUP}, and left out otherwise. A car&apos;s state comes from its location or, until then, its Superchargers.
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
    <div className="mx-auto w-full max-w-2xl px-5 py-12 sm:py-20">
      <Header current="rollout" />
      <h1 className="sr-only">India rollout</h1>
      <Suspense fallback={<RolloutSkeleton />}>
        <Rollout />
      </Suspense>
    </div>
  );
}
