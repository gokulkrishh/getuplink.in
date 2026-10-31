import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { Globe } from "lucide-react";
import { Suspense } from "react";
import { BackLink } from "@/components/back-link";
import { EmptyState } from "@/components/empty-state";
import { CarTabs } from "@/components/car-tabs";
import { Header } from "@/components/header";
import { InfoButton } from "@/components/info-button";
import { ChartCard } from "@/components/chart-card";
import { ChartDownload } from "@/components/chart-download";
import { RolloutAdoption } from "@/components/rollout-adoption";
import { RolloutMap } from "@/components/rollout-map";
import { SkBlock, SkHead, SkSection } from "@/components/skeleton";
import { ArrivingRows, VersionRows } from "@/components/rollout-lists";
import { DEMO } from "@/lib/demo";
import { paged } from "@/lib/list";
import type { YourCar } from "@/lib/rollout-arriving";
import { arrivingRows, cars, versionRows } from "@/lib/rollout-rows";
import { requireReader } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { loadRollout, type RolloutPage } from "@/lib/server/rollout";
import { moreArriving, moreRolloutVersions } from "./actions";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "India rollout" };

const heading = "text-lg font-medium tracking-heading";

// Session check plus data in one browser-only private cache, like the other pages (see app/page.tsx).
async function loadOwnRollout(): Promise<RolloutPage> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  const { owner } = await requireReader();
  // The clock is read inside the cache; reading it while rendering blocks prerendering.
  return loadRollout(owner, Date.now());
}

// The owner's car against India, in one line.
function yourCarWords(car: YourCar): string {
  if (car.kind === "waiting") return `${car.version} is waiting to install on your car`;
  if (car.kind === "newest") return "You're on the newest version";
  return `You're ${car.versions} ${car.versions === 1 ? "version" : "versions"} behind: ${car.newest} is on ${cars(car.cars)}`;
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
  const { states, arriving, yourCar, adoption, releaseNotes } = data;
  const hasAdoption = adoption.day.versions.length > 0 || adoption.week.versions.length > 0;
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
        <h2 className="text-sm text-muted-foreground">Newest version</h2>
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
          <ArrivingRows list={paged(arrivingRows(arriving, releaseNotes))} load={moreArriving} />
          <p className="text-sm text-faint">Updates offered to cars but not installed yet, and how many cars already run each.</p>
        </section>
      )}

      {states.length > 0 && (
        <section data-chart-card="" className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h2 className={heading}>Where it runs</h2>
              <p className="text-sm text-muted-foreground">States each version runs in. Darker is more cars.</p>
            </div>
            <ChartDownload title="Where it runs" className="mt-0.5" />
          </div>
          <RolloutMap versions={states} />
        </section>
      )}

      {hasAdoption && <RolloutAdoption adoption={adoption} />}

      <ChartCard
        title="Versions"
        description="Every version seen, newest first."
      >
        <VersionRows list={paged(versionRows(versions, counted, releaseNotes))} load={moreRolloutVersions} />
      </ChartCard>

      <div className="space-y-2 text-xs text-faint">
        <p className="flex items-center gap-1.5">
          Counts cover every car Uplink tracks, as totals only, never a single car.
          <InfoButton label="How the counts work">
            <p>An offer counts from the car&apos;s last check while awake. A car&apos;s state comes from its location, or from its Supercharger visits until location is allowed.</p>
            <p className="mt-2">Global dates come from a hand-kept list of public first sightings. A version not on it shows no lag. Release notes are Tesla&apos;s.</p>
            <p className="mt-2">
              State boundaries:{" "}
              <a href="https://github.com/datameet/maps" className="tap-target underline decoration-muted-foreground/60 underline-offset-4">DataMeet India community</a> (
              <a href="https://creativecommons.org/licenses/by/4.0/" className="tap-target underline decoration-muted-foreground/60 underline-offset-4">CC BY 4.0</a>), simplified. Map not to scale.
            </p>
          </InfoButton>
        </p>
        {DEMO && <p>Demo mode: a simulated fleet of Indian cars, with simulated global dates.</p>}
      </div>
    </div>
  );
}

function RolloutSkeleton() {
  return (
    <div role="status" aria-busy="true" className="space-y-12">
      <span className="sr-only">Loading…</span>
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-4 w-32" />
      </div>
      {/* Each section: its heading and a block of its usual height, so the loading page is as long as the page. */}
      {[
        ["Arriving now", "h-[335px] sm:h-[260px]"],
        ["Where it runs", "h-[721px] sm:h-[738px]"],
        ["Adoption over time", "h-[338px] sm:h-[232px]"],
        ["Versions", "h-[622px] sm:h-[437px]"],
      ].map(([title, height]) => (
        <SkSection key={title}>
          <SkHead title={title} />
          <SkBlock className={`${height} rounded-lg border bg-muted/40`} />
        </SkSection>
      ))}
    </div>
  );
}

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6 pb-12 sm:pt-8 sm:pb-20">
      <Header current="car" />
      <CarTabs value="updates" />
      <BackLink href="/updates" label="Back to Updates" />
      <h2 className="mb-8 text-lg font-medium tracking-heading">India rollout</h2>
      <Suspense fallback={<RolloutSkeleton />}>
        <Rollout />
      </Suspense>
    </div>
  );
}
