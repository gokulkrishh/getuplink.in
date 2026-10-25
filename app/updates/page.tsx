import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { SyncStreamVersions } from "@/components/background-sync";
import { AWAKE_MS, CarStatus } from "@/components/car-status";
import { DemoBar } from "@/components/demo-bar";
import { Header } from "@/components/header";
import { CheckedFooter, OwnerNotices } from "@/components/owner-notices";
import { ReleaseNotesToggle } from "@/components/release-notes";
import { AwakeTimeline } from "@/components/stats/awake-timeline";
import { ByPeriod, PeriodPicker, PeriodScope } from "@/components/stats/period-scope";
import { customScope, UPDATE_PERIODS } from "@/components/stats/periods";
import { VersionHistory } from "@/components/updates/history";
import { UpdateStats } from "@/components/updates/update-stats";
import { isPending, UpdateStatus } from "@/components/updates/update-status";
import { DEMO, type DemoScenario, parseScenario } from "@/lib/demo";
import { newestTime } from "@/lib/last-synced";
import { customRange, rangeTimeframe, type Timeframe } from "@/lib/periods";
import type { ReleaseNotesByVersion } from "@/lib/release-notes";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { loadUpdatesPage, type UpdatesCar, type UpdatesPage } from "@/lib/server/updates-page";
import { updateStats } from "@/lib/telemetry-derive";
import { currentVersion } from "@/lib/versions";

export const metadata: Metadata = { title: "Updates · Uplink" };

const heading = "text-lg font-medium tracking-heading";

// Session check plus data in one browser-only private cache, like the other pages (see app/page.tsx). The
// demo scenario is an argument, so each one gets its own entry; the period is not, since it switches in the browser.
async function loadOwnUpdates(demo: DemoScenario): Promise<{ data: UpdatesPage; now: number }> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  // The clock is read inside the cache; reading it while rendering blocks prerendering.
  const now = Date.now();
  return { data: await loadUpdatesPage(demo, now), now };
}

// One car: the installed version and its status, the pending update, the history, how updates usually go,
// and when the car was awake to receive one. `label` names the car when there are several; `range` is
// the range picked by date, when the page drew one.
function CarUpdates({ car, notes, label, range, now }: { car: UpdatesCar; notes: ReleaseNotesByVersion; label: string; range: Timeframe | null; now: number }) {
  const { vehicle, latest, lastOnline, history, streamAt, updates, awake } = car;
  // A car that streamed in the last few minutes is awake: keep the page fresh so new data shows up on its own.
  const isAwake = streamAt !== null && now - Date.parse(streamAt) < AWAKE_MS;
  const pending = isPending(lastOnline);
  const version = currentVersion(vehicle.current_version, lastOnline && { version: lastOnline.car_version, at: lastOnline.polled_at });
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
            Asleep at every check so far. Open the Tesla app to wake the car; this page updates on its own.
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

      {latest?.error && <p className="text-xs text-muted-foreground">The car went to sleep during the last check. Uplink will try again.</p>}

      <VersionHistory history={history} notes={notes} now={now} until={vehicle.last_polled_at} />

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className={heading}>Stats</h2>
          {hasStats && <PeriodPicker />}
        </div>
        {hasStats ? (
          <ByPeriod
            panels={{
              ...Object.fromEntries(UPDATE_PERIODS.map((p) => [p, <UpdateStats key={p} rows={updates} now={now} covers={p} />])),
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
  const demo = DEMO ? parseScenario(params.demo) : "normal";
  const { data, now } = await loadOwnUpdates(demo);
  const failedRun = data.kind === "ready" && data.lastRun?.ok === false ? data.lastRun : null;
  const cars = data.kind === "ready" ? data.cars : [];
  // Only the update count follows a range picked by date, and it is counted from rows already here, so
  // the range costs no extra read. Without dates it opens on the last 30 days.
  const range = customRange(params.period, params.from, params.to, now);
  const frame = range && rangeTimeframe(range, now);

  return (
    <>
      {DEMO && <DemoBar active={demo} path="/updates" />}
      <OwnerNotices data={data} count={cars.length} failedRun={failedRun} />
      {data.kind === "ready" && cars.length > 0 && (
        <PeriodScope options={UPDATE_PERIODS} custom={customScope(range, now)}>
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

function UpdatesSkeleton() {
  const block = "bg-muted motion-safe:animate-pulse";
  return (
    <div role="status" aria-busy="true" className="space-y-12">
      <span className="sr-only">Loading…</span>
      <div className="space-y-3">
        <div className={`h-4 w-20 ${block}`} />
        <div className={`h-10 w-56 ${block}`} />
      </div>
      <div className="space-y-2">
        <div className={`h-3 w-14 ${block}`} />
        <div className={`h-4 w-40 ${block}`} />
      </div>
      <div className="space-y-4">
        <div className={`h-3 w-14 ${block}`} />
        <div className={`h-20 w-full ${block}`} />
      </div>
    </div>
  );
}

export default function Page({ searchParams }: PageProps<"/updates">) {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6 pb-12 sm:pt-8 sm:pb-20">
      <Header current="updates" />
      <h1 className="sr-only">Software updates</h1>
      <Suspense fallback={<UpdatesSkeleton />}>
        <Updates searchParams={searchParams} />
      </Suspense>
      <Suspense>
        <SyncStreamVersions />
      </Suspense>
    </div>
  );
}
