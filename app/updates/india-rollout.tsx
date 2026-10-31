import { cacheLife, cacheTag } from "next/cache";
import { Globe } from "lucide-react";
import { ChartCard } from "@/components/chart-card";
import { ChartDownload } from "@/components/chart-download";
import { EmptyState } from "@/components/empty-state";
import { InfoButton } from "@/components/info-button";
import { RolloutAdoption } from "@/components/rollout-adoption";
import { ArrivingRows, VersionRows } from "@/components/rollout-lists";
import { RolloutMap } from "@/components/rollout-map";
import { Ph, SkBlock, SkSection } from "@/components/skeleton";
import { FoldToggle } from "@/components/fold-toggle";
import { DEMO } from "@/lib/demo";
import { paged } from "@/lib/list";
import { yourCarWords } from "@/lib/rollout-arriving";
import { arrivingRows, cars, versionRows } from "@/lib/rollout-rows";
import { requireReader } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { loadRollout, type RolloutPage } from "@/lib/server/rollout";
import { moreArriving, moreRolloutVersions } from "./actions";

const sub = "text-base font-medium tracking-heading";

// Session check plus data in one browser-only private cache, like the other pages (see app/page.tsx).
async function loadOwnRollout(): Promise<RolloutPage> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  const { owner } = await requireReader();
  // The clock is read inside the cache; reading it while rendering blocks prerendering.
  return loadRollout(owner, Date.now());
}

// The heading the section and its skeleton share. Old /rollout links land on it (next.config.ts), and the
// lines under the Software card link to it.
function Heading() {
  return (
    <div className="space-y-1">
      <h2 id="rollout" className="scroll-mt-6 text-lg font-medium tracking-heading">
        India rollout
      </h2>
      <p className="text-sm text-muted-foreground">How each version is reaching cars in India.</p>
    </div>
  );
}

// The India rollout, pooled across every car Uplink tracks, under the owner's own software: the newest
// version Indian cars run, what's arriving now, where each version runs, adoption over time (closed at
// first) and every version seen. Totals only, never a single car.
// Started by the page before it waits for the owner's own updates, so the two reads run side by side. The
// noop catch keeps an early failure from being reported as unhandled before IndiaRollout awaits it (which
// still throws it to the nearest error boundary, as before).
export function startIndiaRollout(): Promise<RolloutPage> {
  const load = loadOwnRollout();
  load.catch(() => {});
  return load;
}

export async function IndiaRollout({ load }: { load: Promise<RolloutPage> }) {
  const data = await load;
  if (data.kind === "error") {
    console.error("India rollout:", data.message);
    return (
      <section className="space-y-6">
        <Heading />
        <p className="text-sm text-muted-foreground">Uplink couldn&apos;t load the India rollout. Try again in a moment.</p>
      </section>
    );
  }
  const { versions, counted, headline } = data.rollout;
  const { states, arriving, yourCar, adoption, releaseNotes } = data;
  const hasAdoption = adoption.day.versions.length > 0 || adoption.week.versions.length > 0;
  if (versions.length === 0) {
    return (
      <section className="space-y-6">
        <Heading />
        <EmptyState icon={<Globe className="size-7 text-faint" aria-hidden="true" />} title="No versions yet">
          Shown once a car reports its version.
        </EmptyState>
      </section>
    );
  }
  return (
    <section className="space-y-10">
      <Heading />

      <div className="space-y-1">
        <h3 className="text-sm text-muted-foreground">Newest in India</h3>
        {headline ? (
          <>
            <p className="font-mono text-2xl font-medium tracking-tight tabular-nums">{headline.version}</p>
            <p className="text-sm text-muted-foreground">
              On {headline.cars} of {cars(headline.of)}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No car runs a reported version right now.</p>
        )}
        {yourCar && <p className="pt-2 text-sm">{yourCarWords(yourCar)}</p>}
      </div>

      {arriving.length > 0 && (
        <section className="space-y-2">
          <div className="space-y-1">
            <h3 className={sub}>Arriving now</h3>
            <p className="text-sm text-muted-foreground">Offered to cars but not installed yet.</p>
          </div>
          <ArrivingRows list={paged(arrivingRows(arriving, releaseNotes))} load={moreArriving} />
        </section>
      )}

      {states.length > 0 && (
        <section data-chart-card="" className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h3 className={sub}>Where it runs</h3>
              <p className="text-sm text-muted-foreground">States each version runs in. Darker is more cars.</p>
            </div>
            <ChartDownload title="Where it runs" />
          </div>
          <RolloutMap versions={states} />
        </section>
      )}

      {hasAdoption && <RolloutAdoption adoption={adoption} />}

      <ChartCard as="h3" title="Versions" description="Every version seen, newest first.">
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
    </section>
  );
}

// Faint blocks in the shape of the section in its usual state: the heading, the newest version, then each
// part with its heading and a block of its usual height, so the loading page is as long as the page.
// Adoption over time is closed at first, so only its row is drawn.
export function IndiaRolloutSkeleton() {
  return (
    <section className="space-y-10" aria-hidden="true">
      <Heading />
      <div className="space-y-1">
        <p className="text-sm"><Ph>Newest in India</Ph></p>
        <p className="font-mono text-2xl font-medium tracking-tight"><Ph>2026.40.2</Ph></p>
        <p className="text-sm"><Ph>On 3 of 40 cars</Ph></p>
        <p className="pt-2 text-sm"><Ph>You&apos;re 1 version behind the newest in India</Ph></p>
      </div>
      {(
        [
          ["Arriving now", "Offered to cars but not installed yet.", "h-[415px] sm:h-[268px]", 2],
          ["Where it runs", "States each version runs in. Darker is more cars.", "h-[656px] sm:h-[719px]", 3],
        ] as const
      ).map(([title, line, height, gap]) => (
        <SkSection key={title} gap={gap}>
          <div className="space-y-1">
            <p className={sub}><Ph>{title}</Ph></p>
            <p className="text-sm"><Ph>{line}</Ph></p>
          </div>
          <SkBlock className={`${height} rounded-lg`} />
        </SkSection>
      ))}
      <div className="flex w-full items-center justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className={sub}><Ph>Adoption over time</Ph></p>
          <p className="text-sm"><Ph>Share of cars on the picked version.</Ph></p>
        </div>
        <FoldToggle className="opacity-0" />
      </div>
      <SkSection>
        <div className="space-y-1">
          <p className={sub}><Ph>Versions</Ph></p>
          <p className="text-sm"><Ph>Every version seen, newest first.</Ph></p>
        </div>
        <SkBlock className="h-[597px] sm:h-[412px] rounded-lg" />
      </SkSection>
      <div className="space-y-2 text-xs">
        <p><Ph>Counts cover every car Uplink tracks, as totals only, never a single car.</Ph></p>
        {DEMO && <p><Ph>Demo mode: a simulated fleet of Indian cars, with simulated global dates.</Ph></p>}
      </div>
    </section>
  );
}
