import { cacheLife, cacheTag } from "next/cache";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SyncChargingSessions, SyncStreamVersions } from "@/components/background-sync";
import { DemoBar } from "@/components/demo-bar";
import { Header } from "@/components/header";
import { Headline } from "@/components/home/headline";
import { NowStrip } from "@/components/home/now-strip";
import { CheckedFooter, OwnerNotices } from "@/components/owner-notices";
import { ByPeriod, PeriodPicker, PeriodScope } from "@/components/stats/period-scope";
import { parsePeriod, PERIODS } from "@/components/stats/periods";
import { UpdateBanner } from "@/components/updates/update-banner";
import { BatteryHealth, LastCharge, RecentActivity, WeekStrip } from "@/components/vehicle-extras";
import { matchSessions } from "@/lib/charge-sessions";
import { pricedSessions } from "@/lib/charging-rates";
import { DEMO, type DemoScenario, parseScenario } from "@/lib/demo";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { type Dashboard as DashboardData, loadDashboard, OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { type Home, loadHome } from "@/lib/server/home";

// The session check and the data share one private scope: the result lives only in this browser's
// router cache (never a server cache), so a header link's prefetch can carry it. The check still runs
// on every server render; redirect() throws, so a signed-out result is never cached. The demo
// scenario is an argument, so each one gets its own entry; the period is not, since it switches in the
// browser. `dashboard` feeds the old sections below the new ones until they are replaced.
async function loadOwnHome(demo: DemoScenario): Promise<{ home: Home; dashboard: DashboardData; now: number }> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  // 60s is enough for a per-link prefetch (30s minimum); the App Shell would need 5 minutes.
  cacheLife({ stale: 60 });
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  // The clock is read here, inside the cache, because reading it while rendering blocks prerendering.
  const now = Date.now();
  const [home, dashboard] = await Promise.all([loadHome(demo, now), loadDashboard(demo)]);
  return { home, dashboard, now };
}

// The period switch and the four headline numbers, in every period (see ByPeriod).
function HomeTotals({ home, now }: { home: Extract<Home, { kind: "ready" }>; now: number }) {
  const { streamOnly } = matchSessions(home.sessions, home.streamSessions, now);
  const priced = pricedSessions(streamOnly, home.rates);
  return (
    <section aria-label="Totals" className="space-y-6">
      <PeriodPicker />
      <ByPeriod
        panels={Object.fromEntries(
          PERIODS.map(({ value }) => [
            value,
            <Headline key={value} period={value} now={now} figures={home.figures} sessions={home.sessions} streamOnly={streamOnly} priced={priced} />,
          ]),
        )}
      />
    </section>
  );
}

async function HomeContent({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const params = await searchParams;
  // Only demo mode reads the scenario, so the real page stays as it was.
  const demo = DEMO ? parseScenario(params.demo) : "normal";
  // Read outside the cache: the period only picks what's shown first, and switches in the browser.
  const period = parsePeriod(params.period);
  const { home, dashboard, now } = await loadOwnHome(demo);
  const failedRun = home.kind === "ready" && home.lastRun?.ok === false ? home.lastRun : null;
  const cars = home.kind === "ready" ? home.cars : [];

  return (
    <>
      {DEMO && <DemoBar active={demo} />}
      <OwnerNotices data={home} count={cars.length} failedRun={failedRun} />
      {home.kind === "ready" && cars.length > 0 && (
        <div className="space-y-12">
          {cars.map((car, k) => (
            <div key={car.vehicle.id} className="space-y-6">
              {/* The odometer is the primary car's, the first. */}
              <NowStrip car={car} odometerKm={k === 0 ? home.figures.odometerKm : null} now={now} />
              <UpdateBanner snapshot={car.lastOnline} />
            </div>
          ))}
          <PeriodScope initial={period}>
            <HomeTotals home={home} now={now} />
          </PeriodScope>
          {dashboard.kind === "ready" &&
            dashboard.vehicles.map(({ vehicle, extras }) => (
              <div key={vehicle.id} className="space-y-12">
                <WeekStrip week={extras?.week ?? null} />
                <BatteryHealth id={vehicle.id} kwh={extras?.healthKwh ?? null} />
                {extras && <LastCharge item={extras.lastCharge} now={now} />}
                {extras && <RecentActivity events={extras.activity} now={now} />}
              </div>
            ))}
          {cars.some((car) => car.latest?.error) && (
            <p className="text-xs text-muted-foreground">The car went to sleep during the last check. Uplink will try again.</p>
          )}
        </div>
      )}
      {home.kind === "ready" && <CheckedFooter lastRun={home.lastRun} showError={cars.length > 0} />}
    </>
  );
}

// Shown while the page loads: faint blocks in the shape of the car strip and the totals.
function HomeSkeleton() {
  const block = "bg-muted motion-safe:animate-pulse";
  return (
    <div role="status" aria-busy="true" className="space-y-12">
      <span className="sr-only">Loading…</span>
      <div className="space-y-4">
        <div className={`h-4 w-40 ${block}`} />
        <div className={`h-8 w-32 ${block}`} />
        <div className={`h-1 w-full max-w-sm ${block}`} />
        <div className={`h-4 w-48 ${block}`} />
      </div>
      <div className="space-y-6">
        <div className={`h-8 w-64 ${block}`} />
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((k) => (
            <div key={k} className={`h-24 ${block}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Page({ searchParams }: PageProps<"/">) {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-12 sm:py-20">
      <Header />
      <h1 className="sr-only">Your car</h1>
      <Suspense fallback={<HomeSkeleton />}>
        <HomeContent searchParams={searchParams} />
      </Suspense>
      <Suspense>
        <SyncStreamVersions />
      </Suspense>
      <Suspense>
        <SyncChargingSessions />
      </Suspense>
    </div>
  );
}
