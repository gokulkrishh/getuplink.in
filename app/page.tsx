import { cacheLife, cacheTag } from "next/cache";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SyncStreamSessions, SyncStreamVersions } from "@/components/background-sync";
import { DemoBar } from "@/components/demo-bar";
import { Header } from "@/components/header";
import { Headline } from "@/components/home/headline";
import { NowStrip } from "@/components/home/now-strip";
import { BatterySection, ChargingSection, DrivingSection } from "@/components/home/sections";
import { CheckedFooter, OwnerNotices } from "@/components/owner-notices";
import { listSessions } from "@/components/session-row";
import { ByPeriod, PeriodPicker, PeriodScope } from "@/components/stats/period-scope";
import { PERIODS } from "@/components/stats/periods";
import { UpdateBanner } from "@/components/updates/update-banner";
import { matchSessions } from "@/lib/charge-sessions";
import { firstStartedAt } from "@/lib/charging-figures";
import { withDriveEfficiency } from "@/lib/drive-stats";
import { DRIVE_DAYS } from "@/lib/drives";
import { monthlyRows } from "@/lib/monthly";
import { MonthlyTable } from "@/components/home/monthly-table";
import { DEMO, DEMO_SITE, type DemoScenario, parseScenario } from "@/lib/demo";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { type Home, loadHome } from "@/lib/server/home";

// The session check and the data share one private scope: the result lives only in this browser's
// router cache (never a server cache), so a header link's prefetch can carry it. The check still runs
// on every server render; redirect() throws, so a signed-out result is never cached. The demo
// scenario is an argument, so each one gets its own entry; the period is not, since it switches in the
// browser.
async function loadOwnHome(demo: DemoScenario): Promise<{ home: Home; now: number }> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  // 60s is enough for a per-link prefetch (30s minimum); the App Shell would need 5 minutes.
  cacheLife({ stale: 60 });
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  // The clock is read here, inside the cache, because reading it while rendering blocks prerendering.
  const now = Date.now();
  return { home: await loadHome(demo, now), now };
}

// The period switch, the four headline numbers, then charging, driving and battery: each in every
// period, so the switch needs no server trip (see ByPeriod).
function Totals({ home, now }: { home: Extract<Home, { kind: "ready" }>; now: number }) {
  const { pairs, streamOnly } = matchSessions(home.sessions, home.streamSessions, now);
  const { window } = home;
  const figures = withDriveEfficiency(home.figures, window.driving.drives, now);
  const chargingSince = firstStartedAt(home.sessions, home.streamSessions);
  return (
    <div className="space-y-16">
      <section aria-label="Totals" className="space-y-6">
        <PeriodPicker />
        <ByPeriod
          steady
          panels={Object.fromEntries(
            PERIODS.map(({ value }) => [
              value,
              <Headline key={value} period={value} now={now} figures={figures} sessions={home.sessions} streamOnly={streamOnly} chargingSince={chargingSince} />,
            ]),
          )}
        />
      </section>
      <DrivingSection figures={figures} drives={window.driving.drives} now={now} />
      <ChargingSection sessions={home.sessions} listed={listSessions(pairs, streamOnly)} now={now} />
      <BatterySection level={window.level} drain={window.driving.drain} parkedNow={window.driving.parkedNow} now={now} />
      <MonthlyTable
        rows={monthlyRows(
          window.driving.drives,
          [
            ...home.sessions.map((s) => ({ started_at: s.started_at, kwh: s.energy_kwh, cost: s.cost_total })),
            ...streamOnly.flatMap((s) =>
              s.ended_at === null ? [] : [{ started_at: s.started_at, kwh: s.energy_added_kwh, cost: home.invoices.get(s.id)?.amount ?? null }],
            ),
          ],
          now - DRIVE_DAYS * 86_400_000,
          now,
        )}
      />
    </div>
  );
}

async function HomeContent({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const params = await searchParams;
  // Only demo mode reads the scenario, so the real page stays as it was.
  const demo = DEMO && !DEMO_SITE ? parseScenario(params.demo) : "normal";
  const { home, now } = await loadOwnHome(demo);
  const failedRun = home.kind === "ready" && home.lastRun?.ok === false ? home.lastRun : null;
  const cars = home.kind === "ready" ? home.cars : [];
  // The primary car, as loadHome picks it: the first with a VIN. The odometer is its.
  const primaryId = cars.find((car) => car.vehicle.vin)?.vehicle.id;

  return (
    <>
      {/* The scenario switch is for trying states locally; the public demo just shows the data. */}
      {DEMO && !DEMO_SITE && <DemoBar active={demo} />}
      <OwnerNotices data={home} count={cars.length} failedRun={failedRun} />
      {home.kind === "ready" && cars.length > 0 && (
        <div className="space-y-12">
          {cars.map((car) => (
            <div key={car.vehicle.id} className="space-y-6">
              <NowStrip car={car} odometerKm={car.vehicle.id === primaryId ? home.figures.odometerKm : null} now={now} />
              <UpdateBanner snapshot={car.lastOnline} />
            </div>
          ))}
          <PeriodScope>
            <Totals home={home} now={now} />
          </PeriodScope>
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
        <div className="grid grid-cols-2 gap-px border bg-border bg-clip-padding sm:grid-cols-4">
          {[0, 1, 2, 3].map((k) => (
            <div key={k} className="space-y-2 bg-background p-3 sm:p-4">
              <div className={`h-3 w-16 ${block}`} />
              <div className={`h-6 w-20 ${block}`} />
              <div className={`h-10 w-full ${block}`} />
              <div className={`h-6 w-full ${block}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Page({ searchParams }: PageProps<"/">) {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6 pb-12 sm:pt-8 sm:pb-20">
      <Header />
      <h1 className="sr-only">Your car</h1>
      <Suspense fallback={<HomeSkeleton />}>
        <HomeContent searchParams={searchParams} />
      </Suspense>
      <Suspense>
        <SyncStreamVersions />
      </Suspense>
      <Suspense>
        <SyncStreamSessions />
      </Suspense>
    </div>
  );
}
