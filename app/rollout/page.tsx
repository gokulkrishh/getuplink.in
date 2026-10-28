import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { redirect } from "next/navigation";
import { Globe } from "lucide-react";
import { Suspense } from "react";
import { EmptyState } from "@/components/empty-state";
import { CarTabs } from "@/components/car-tabs";
import { Header } from "@/components/header";
import { InfoButton } from "@/components/info-button";
import { ChartCard } from "@/components/chart-card";
import { ReleaseNotesToggle } from "@/components/release-notes";
import { RolloutAdoption } from "@/components/rollout-adoption";
import { RolloutMap } from "@/components/rollout-map";
import { SkBlock, SkHead, SkSection } from "@/components/skeleton";
import { ShareBar } from "@/components/rollout-share-bar";
import { DEMO } from "@/lib/demo";
import { formatShortDate } from "@/lib/format";
import type { ReleaseNotesByVersion } from "@/lib/release-notes";
import type { RolloutVersion } from "@/lib/rollout";
import type { Arriving, YourCar } from "@/lib/rollout-arriving";
import { currentOwner, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { loadRollout, type RolloutPage } from "@/lib/server/rollout";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "India rollout" };

const heading = "text-lg font-medium tracking-heading";

// Session check plus data in one browser-only private cache, like the other pages (see app/page.tsx).
async function loadOwnRollout(): Promise<RolloutPage> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  const owner = await currentOwner();
  if (!owner) redirect(SIGNED_OUT_PATH);
  // The clock is read inside the cache; reading it while rendering blocks prerendering.
  return loadRollout(owner, Date.now());
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
  if (car.kind === "waiting") return `${car.version} is waiting to install on your car`;
  if (car.kind === "newest") return "You're on the newest version";
  return `You're ${car.versions} ${car.versions === 1 ? "version" : "versions"} behind: ${car.newest} is on ${cars(car.cars)}`;
}

// One version on offer: cars it's waiting on and cars already on it, and its notes when Tesla sent any.
function ArrivingRow({ a, n, notes }: { a: Arriving; n: number; notes: ReleaseNotesByVersion }) {
  return (
    <li className="flex gap-4 py-3">
      <span className="w-6 shrink-0 pt-0.5 font-mono text-xs text-faint">{n}</span>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-baseline gap-4 text-sm tabular-nums">
          <span className="flex-1 font-mono font-medium">{a.version}</span>
          <span className="text-right whitespace-nowrap text-muted-foreground">
            Offered to {cars(a.offered)} · on {a.on}
          </span>
        </div>
        <ReleaseNotesToggle version={a.version} notes={notes} stacked />
      </div>
    </li>
  );
}

// One version: cars on it now with a bar against every counted car (hover or tap it for the share), and how
// its arrival compares with the world. A version no car is on any more has no bar: an empty track reads as
// a chart still loading.
function VersionRow({ v, counted, n, notes }: { v: RolloutVersion; counted: number; n: number; notes: ReleaseNotesByVersion }) {
  return (
    <li className="flex gap-4 py-4">
      <span className="w-6 shrink-0 pt-0.5 font-mono text-xs text-faint">{n}</span>
      <div className="min-w-0 flex-1 space-y-2">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-mono text-sm font-medium tabular-nums">{v.version}</span>
        <span className={cn("text-sm tabular-nums", v.carsNow === 0 && "text-faint")}>{cars(v.carsNow)}</span>
      </div>
      {v.carsNow > 0 && <ShareBar on={v.carsNow} of={counted} />}
      {/* Only what's known: a car already on the version when tracking began has no arrival date. */}
      {(v.firstInIndia || v.globalRelease) && (
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
          {v.firstInIndia && <span>First in India {formatShortDate(v.firstInIndia)}</span>}
          {v.globalRelease && <span>Global {releaseDay(v.globalRelease)}</span>}
          {v.lagDays !== null && <span className="text-foreground">{lagWords(v.lagDays)}</span>}
        </p>
      )}
      <ReleaseNotesToggle version={v.version} notes={notes} stacked />
      </div>
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
          <ul className="divide-y border-t">
            <li className="flex gap-4 py-2 text-xs text-faint" aria-hidden="true">
              <span className="w-6 shrink-0">#</span>
              <span className="flex-1">Version</span>
              <span>Offered · on it</span>
            </li>
            {arriving.map((a, k) => (
              <ArrivingRow key={a.version} a={a} n={k + 1} notes={releaseNotes} />
            ))}
          </ul>
          <p className="text-sm text-faint">Updates offered to cars but not installed yet, and how many cars already run each.</p>
        </section>
      )}

      {states.length > 0 && (
        <section className="space-y-3">
          <div className="space-y-1">
            <h2 className={heading}>Where it runs</h2>
            <p className="text-sm text-muted-foreground">States each version runs in. Darker is more cars.</p>
          </div>
          <RolloutMap versions={states} />
        </section>
      )}

      {hasAdoption && <RolloutAdoption adoption={adoption} />}

      <ChartCard
        title="Versions"
        description="Every version seen, newest first."
      >
        <ul className="divide-y border-t">
          <li className="flex gap-4 py-2 text-xs text-faint" aria-hidden="true">
            <span className="w-6 shrink-0">#</span>
            <span className="flex-1">Version</span>
            <span>Cars on it</span>
          </li>
          {versions.map((v, k) => (
            <VersionRow key={v.version} v={v} counted={counted} n={k + 1} notes={releaseNotes} />
          ))}
        </ul>
      </ChartCard>

      <div className="space-y-2 text-xs text-faint">
        <p className="flex items-center gap-1.5">
          Counts cover every car Uplink tracks, as totals only, never a single car.
          <InfoButton label="How the counts work">
            <p>An offer counts from the car&apos;s last check while awake. A car&apos;s state comes from its location, or from its Supercharger visits until location is allowed.</p>
            <p className="mt-2">Global dates come from a hand-kept list of public first sightings. A version not on it shows no lag. Release notes are Tesla&apos;s.</p>
            <p className="mt-2">
              State boundaries:{" "}
              <a href="https://github.com/datameet/maps" className="underline underline-offset-4">DataMeet India community</a> (
              <a href="https://creativecommons.org/licenses/by/4.0/" className="underline underline-offset-4">CC BY 4.0</a>), simplified. Map not to scale.
            </p>
          </InfoButton>
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
      {/* Each section: its heading and a block of its usual height, so the loading page is as long as the page. */}
      {[
        ["Arriving now", "h-[335px] sm:h-[260px]"],
        ["Where it runs", "h-[721px] sm:h-[738px]"],
        ["Adoption over time", "h-[338px] sm:h-[232px]"],
        ["Versions", "h-[871px] sm:h-[632px]"],
      ].map(([title, height]) => (
        <SkSection key={title}>
          <SkHead title={title} />
          <SkBlock className={`${height} border bg-muted/40`} />
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
      <h2 className="mb-8 text-lg font-medium tracking-heading">India rollout</h2>
      <Suspense fallback={<RolloutSkeleton />}>
        <Rollout />
      </Suspense>
    </div>
  );
}
