import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Loading, Ph, SkHead, SkLine, SkSection, SkShowMore } from "@/components/skeleton";
import { AutoRefresh } from "@/components/auto-refresh";
import { SyncStreamVersions } from "@/components/background-sync";
import { AWAKE_MS, CarStatus } from "@/components/car-status";
import { CarTabs } from "@/components/car-tabs";
import { Header } from "@/components/header";
import { MoreLink } from "@/components/more-link";
import { CheckedFooter, OwnerNotices } from "@/components/owner-notices";
import { ReleaseNotesToggle } from "@/components/release-notes";
import { AwakeTimeline } from "@/components/stats/awake-timeline";
import { ByPeriod, PeriodPicker, PeriodScope } from "@/components/stats/period-scope";
import { customScope, PAGE_PERIODS } from "@/components/stats/periods";
import { VersionHistory } from "@/components/updates/history";
import { UpdateStats } from "@/components/updates/update-stats";
import { isPending, UpdateStatus } from "@/components/updates/update-status";
import type { DemoScenario } from "@/lib/demo";
import { newestTime } from "@/lib/last-synced";
import { customRange, rangeTimeframe, type Timeframe } from "@/lib/periods";
import type { ReleaseNotesByVersion } from "@/lib/release-notes";
import { currentOwner, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { loadUpdatesPage, type UpdatesCar, type UpdatesPage } from "@/lib/server/updates-page";
import { updateStats } from "@/lib/telemetry-derive";
import { currentVersion } from "@/lib/versions";

export const metadata: Metadata = { title: "Updates" };

const heading = "text-lg font-medium tracking-heading";

// Session check plus data in one browser-only private cache, like the other pages (see app/page.tsx). The
// demo scenario is an argument, so each one gets its own entry; the period is not, since it switches in the browser.
async function loadOwnUpdates(demo: DemoScenario): Promise<{ data: UpdatesPage; now: number }> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  const owner = await currentOwner();
  if (!owner) redirect(SIGNED_OUT_PATH);
  // The clock is read inside the cache; reading it while rendering blocks prerendering.
  const now = Date.now();
  return { data: await loadUpdatesPage(owner, demo, now), now };
}

// One car: the installed version and its status, the pending update, the history, how updates usually go,
// and when the car was awake to receive one. `label` names the car when there are several; `range` is
// the range picked by date, when the page drew one.
function CarUpdates({ car, notes, label, range, now }: { car: UpdatesCar; notes: ReleaseNotesByVersion; label: string; range: Timeframe | null; now: number }) {
  const { vehicle, latest, lastOnline, history, streamAt, updates, awake } = car;
  // A car that streamed in the last few minutes is awake: keep the page fresh so new data shows up on its own.
  const isAwake = streamAt !== null && now - Date.parse(streamAt) < AWAKE_MS;
  const version = currentVersion(vehicle.current_version, lastOnline && { version: lastOnline.car_version, at: lastOnline.polled_at });
  const pending = isPending(lastOnline, version);
  const hasStats = updateStats(updates, now) !== null;
  return (
    <section className="space-y-12">
      {isAwake && <AutoRefresh />}
      <header className="space-y-1">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <h2 className="text-sm text-muted-foreground">{label}</h2>
          <p className="text-sm text-faint tabular-nums">
            <CarStatus
              state={latest?.state ?? null}
              streaming={isAwake}
              seenAt={streamAt && (!vehicle.last_seen_at || Date.parse(streamAt) > Date.parse(vehicle.last_seen_at)) ? streamAt : vehicle.last_seen_at}
              checkedAt={latest?.polled_at ?? null}
              now={now}
            />
          </p>
        </div>
        <p className="font-mono text-4xl font-medium tracking-tight tabular-nums">{version ?? "—"}</p>
        {version ? (
          <div className="pt-2">
            <ReleaseNotesToggle version={version} notes={notes} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Asleep at every check so far. Open the Tesla app to wake the car. This page updates on its own.
          </p>
        )}
      </header>

      {/* Only while an update is on its way; the version above already says what the car runs. */}
      {pending && (
      <dl className="text-sm">
        <div>
          <dt className={`mb-2 ${heading}`}>Update</dt>
          <dd>
            <UpdateStatus snapshot={lastOnline} now={now} />
            {lastOnline?.update_version && notes[lastOnline.update_version] && (
              <div className="pt-3">
                <ReleaseNotesToggle version={lastOnline.update_version} notes={notes} stacked />
              </div>
            )}
          </dd>
        </div>
      </dl>
      )}

      {latest?.error && <p className="text-sm text-muted-foreground">The car went to sleep during the last check. Uplink will try again.</p>}

      <VersionHistory history={history} notes={notes} now={now} />

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className={heading}>Stats</h2>
          {hasStats && <PeriodPicker />}
        </div>
        {hasStats ? (
          <ByPeriod
            panels={{
              ...Object.fromEntries(PAGE_PERIODS.updates.options.map((p) => [p, <UpdateStats key={p} rows={updates} now={now} covers={p} />])),
              ...(range && { custom: <UpdateStats rows={updates} now={now} covers={range} /> }),
            }}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Update stats show up after your car&apos;s second update.</p>
        )}
      </section>

      <AwakeTimeline days={awake} now={now} />
    </section>
  );
}

async function Updates({ searchParams }: Pick<PageProps<"/updates">, "searchParams">) {
  const params = await searchParams;
  const demo: DemoScenario = "normal";
  const { data, now } = await loadOwnUpdates(demo);
  const failedRun = data.kind === "ready" && data.lastRun?.ok === false ? data.lastRun : null;
  const cars = data.kind === "ready" ? data.cars : [];
  // Only the update count follows a range picked by date, and it is counted from rows already here, so
  // the range costs no extra read. Without dates it opens on the last 30 days.
  const range = customRange(params.period, params.from, params.to, now);
  const frame = range && rangeTimeframe(range, now);

  return (
    <>
      <OwnerNotices data={data} count={cars.length} failedRun={failedRun} />
      {data.kind === "ready" && cars.length > 0 && (
        <PeriodScope periods={PAGE_PERIODS.updates} custom={customScope(range, now)}>
          <div className="space-y-24">
            {cars.map((car) => (
              <CarUpdates
                key={car.vehicle.id}
                car={car}
                notes={data.releaseNotes}
                label={cars.length > 1 ? car.vehicle.display_name || "Tesla" : "Software"}
                range={frame}
                now={now}
              />
            ))}
          </div>
        </PeriodScope>
      )}
      {data.kind === "ready" && (
        <CheckedFooter syncedAt={newestTime(cars.flatMap((car) => [car.latest?.polled_at, car.streamAt]))} now={now} lastRun={data.lastRun} showError={cars.length > 0} />
      )}
    </>
  );
}

// Faint blocks in the shape of one car's page, section by section, in the sections' own layout classes. Sized
// for the usual state: no update on its way (the pending-update block sits between the version and History).
function UpdatesSkeleton() {
  return (
    <Loading className="space-y-12">
      <header className="space-y-1" aria-hidden="true">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <p className="text-sm"><Ph>Software</Ph></p>
          <p className="text-sm"><Ph>Synced 2 minutes ago</Ph></p>
        </div>
        <p className="font-mono text-4xl font-medium tracking-tight"><Ph>2026.38.5.1</Ph></p>
        <div className="pt-2">
          <p className="text-sm leading-[1.125rem]"><Ph>Release notes</Ph></p>
        </div>
      </header>
      <section className="space-y-4" aria-hidden="true">
        <div className="space-y-1">
          <p className={heading}><Ph>History</Ph></p>
          <p className="text-sm"><Ph>9 versions</Ph></p>
        </div>
        <div className="overflow-hidden max-sm:-mx-1 max-sm:px-1">
          <div className="max-sm:min-w-xl">
          <div className="history-cols pb-2 text-xs">
            <p className="pl-5"><Ph>Versions</Ph></p>
            {["Received", "Installed", "Odometer"].map((h) => (
              <span key={h} className="text-right"><Ph>{h}</Ph></span>
            ))}
          </div>
          <ul className="text-sm">
            {[0, 1, 2].map((k) => (
              <li key={k} className="history-cols border-t py-[11px] max-sm:py-[13.5px]">
                <span className="pl-5 font-mono"><Ph>2026.38.5.1</Ph></span>
                {["16 Oct", "18 Oct", "8,584.0km"].map((v) => (
                  <span key={v} className="text-right whitespace-nowrap"><Ph>{v}</Ph></span>
                ))}
                <span className="col-span-full -mt-1 pb-0.5 pl-5 text-xs"><Ph>Downloaded in 45 min · Installed in 32 min</Ph></span>
              </li>
            ))}
          </ul>
          <SkShowMore />
          </div>
        </div>
      </section>
      <section className="space-y-4" aria-hidden="true">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className={heading}><Ph>Stats</Ph></p>
          <div className="inline-flex max-w-full border">
            {["Month", "Year", "All", "Custom"].map((label) => (
              <span key={label} className="tap-target inline-flex h-7 items-center justify-center px-2.5 text-[0.8rem] max-sm:h-9 max-sm:px-2"><Ph>{label}</Ph></span>
            ))}
          </div>
        </div>
        <dl className="divide-y border-t">
          {["Average wait from offered to installed", "Updates this month", "Average time between updates", "Longest on one version"].map((label) => (
            <div key={label} className="flex items-baseline justify-between gap-4 py-3 text-sm">
              <dt><Ph>{label}</Ph></dt>
              <dd className="font-mono font-medium"><Ph>2 days</Ph></dd>
            </div>
          ))}
        </dl>
      </section>
      <SkSection>
        <SkHead title="Awake and asleep" description="When the car was awake each day. Updates download only then." />
        <SkLine>Awake on 14 of the last 14 days</SkLine>
        <div className="space-y-3" aria-hidden="true">
          <div className="space-y-3 bg-muted px-3 pt-4 pb-3 motion-safe:animate-pulse dark:bg-card">
            <ol className="space-y-1.5">
              {Array.from({ length: 14 }, (_, k) => (
                <li key={k} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-xs"><Ph>Yesterday</Ph></span>
                  <div className="h-4 flex-1 bg-background/60" />
                </li>
              ))}
            </ol>
            <div className="h-4" />
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {["Online", "Asleep", "Offline", "No data"].map((label) => (
              <li key={label} className="inline-flex items-center gap-1.5">
                <span className="size-2 bg-muted" />
                <Ph>{label}</Ph>
              </li>
            ))}
          </ul>
        </div>
      </SkSection>
    </Loading>
  );
}

export default function Page({ searchParams }: PageProps<"/updates">) {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6 pb-12 sm:pt-8 sm:pb-20">
      <Header current="car" />
      <CarTabs value="updates" />
      {/* The India rollout lives under Updates: where an owner waiting for a version looks. */}
      <p className="-mt-4 mb-8 text-right text-sm">
        <MoreLink href="/rollout">India rollout</MoreLink>
      </p>
      <Suspense fallback={<UpdatesSkeleton />}>
        <Updates searchParams={searchParams} />
      </Suspense>
      <Suspense>
        <SyncStreamVersions />
      </Suspense>
    </div>
  );
}
