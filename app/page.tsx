import { cacheLife, cacheTag } from "next/cache";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SyncStreamSessions, SyncStreamVersions } from "@/components/background-sync";
import { Header } from "@/components/header";
import { Headline } from "@/components/home/headline";
import { NowStrip } from "@/components/home/now-strip";
import { BatterySection, ChargingSection, DrivingSection } from "@/components/home/sections";
import { CarNotices, CheckedFooter, OwnerNotices } from "@/components/owner-notices";
import { listSessions, withSpots } from "@/components/session-row";
import { eachFrame } from "@/components/home/frames";
import { PeriodScope } from "@/components/stats/period-scope";
import { matchSessions } from "@/lib/charge-sessions";
import { chargingBills, energyIn, firstStartedAt } from "@/lib/charging-figures";
import { withDriveEfficiency } from "@/lib/drive-stats";
import { periodFrames } from "@/lib/frames";
import { daysLabel } from "@/lib/periods";
import { istDay, istDayStart } from "@/lib/telemetry-derive";
import { after, connection } from "next/server";
import { AiLine } from "@/components/ai-line";
import { type WeekFacts, weekFacts } from "@/lib/week-wording";
import { generateWeekLine, loadWeekLine } from "@/lib/server/week-wording";
import { newestTime } from "@/lib/last-synced";
import type { DemoScenario } from "@/lib/demo";
import { currentOwner, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { type Home, loadHome } from "@/lib/server/home";
import { loadTripPlaces } from "@/lib/server/trip-places";

// The session check and the data share one private scope: the result lives only in this browser's
// router cache (never a server cache), so a header link's prefetch can carry it. The check still runs
// on every server render; redirect() throws, so a signed-out result is never cached. The demo
// scenario is an argument, so each one gets its own entry; the period is not, since it switches in the
// browser.
async function loadOwnHome(demo: DemoScenario): Promise<{ home: Home; routes: Record<number, string>; now: number }> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  // 60s is enough for a per-link prefetch (30s minimum); the App Shell would need 5 minutes.
  cacheLife({ stale: 60 });
  const owner = await currentOwner();
  if (!owner) redirect(SIGNED_OUT_PATH);
  // The clock is read here, inside the cache, because reading it while rendering blocks prerendering.
  const now = Date.now();
  const home = await loadHome(owner, demo, now);
  // Where the week's trips went, for the Driving list's rows.
  const vin = home.kind === "ready" ? (home.cars.find((car) => car.vehicle.vin)?.vehicle.vin ?? null) : null;
  const week = home.kind === "ready" ? home.window.driving.drives.filter((d) => d.start >= now - 7 * 86_400_000) : [];
  const routes = await loadTripPlaces(owner, vin, week).catch(() => ({}));
  return { home, routes, now };
}

// "Good morning" before noon, "Good afternoon" until 5 PM, "Good evening" after, India time.
function greeting(now: number): string {
  const hour = new Date(now + 330 * 60_000).getUTCHours();
  return hour >= 4 && hour < 12 ? "Good morning" : hour >= 12 && hour < 17 ? "Good afternoon" : "Good evening";
}

// Today's AI line on the week (lib/server/week-wording.ts): the stored one, or none and one written after
// the response for the next visit.
async function WeekLine({ vehicleId, day, facts }: { vehicleId: string; day: number; facts: WeekFacts }) {
  // Outside the cached scope, the session check reads the clock, so this part renders per request.
  await connection();
  const owner = await currentOwner();
  if (!owner) return null;
  const key = { vehicleId, day };
  const stored = await loadWeekLine(owner, key, facts);
  if (stored.generate) after(() => generateWeekLine(owner, key, facts));
  return stored.line ? (
    <p className="pt-1 text-sm text-muted-foreground">
      <AiLine line={{ text: stored.line, ai: true }} about="Written by AI from this week's figures." />
    </p>
  ) : null;
}

// The four headline numbers, then driving, charging and battery, over the last 7 days.
function Totals({ home, routes, now }: { home: Extract<Home, { kind: "ready" }>; routes: Record<number, string>; now: number }) {
  const { pairs, streamOnly } = matchSessions(home.sessions, home.streamSessions, now);
  const { window } = home;
  const figures = withDriveEfficiency(home.figures, window.driving.drives, now);
  const chargingSince = firstStartedAt(home.sessions, home.streamSessions);
  const primary = home.cars.find((car) => car.vehicle.vin)?.vehicle;
  const carName = primary?.display_name || null;
  const primaryId = primary ? String(primary.id) : null;
  // Home shows the last 7 days only (PAGE_PERIODS.home); the other periods are Stats'.
  const frames = periodFrames(figures, null, window.driving.drives, now).filter((f) => f.key === "week");
  // Real bills, counted as Charging counts them: Tesla's for Superchargers, attached invoices for the rest.
  const bills = chargingBills(home.sessions, streamOnly, home.invoices);
  return (
    <div className="space-y-12">
      <section aria-label="Totals" className="space-y-6">
        {/* A greeting by the time of day in India, then the week it covers: the period, named once. */}
        <div className="space-y-1">
          <h2 className="text-xl font-medium tracking-heading">{greeting(now)}</h2>
          <p className="text-sm text-muted-foreground">
            Here&apos;s {carName ? `${carName}'s` : "your"} last 7 days, {daysLabel(istDay(frames[0].frame.span.from), istDay(Math.min(frames[0].frame.span.to - 1, now)), now)}.
          </p>
        </div>
        {eachFrame(
          frames,
          ({ key, frame, driving }) => (
            <Headline key={key} frame={frame} driving={driving} since={figures.since} now={now} sessions={home.sessions} streamOnly={streamOnly} bills={bills} chargingSince={chargingSince} />
          ),
          { steady: true },
        )}
        {/* The AI's line on the week streams in after the rest; until then, and when there's none, nothing. */}
        {primaryId && (
          <Suspense fallback={null}>
            <WeekLine vehicleId={primaryId} day={istDayStart(istDay(now))} facts={weekFacts(frames[0].frame, frames[0].driving, window.driving.drives, bills, energyIn(home.sessions, streamOnly, frames[0].frame.span))} />
          </Suspense>
        )}
      </section>
      <DrivingSection frames={frames} figures={figures} drives={window.driving.drives} routes={routes} now={now} />
      <ChargingSection frames={frames} bills={bills} listed={withSpots(listSessions(pairs, streamOnly, home.invoices), home.spots)} chargingSince={chargingSince} now={now} />
      <BatterySection frames={frames} level={window.level} parked={window.driving.parked} parkedNow={window.driving.parkedNow} now={now} />
    </div>
  );
}

async function HomeContent() {
  // Only demo mode reads the scenario, so the real page stays as it was.
  const demo: DemoScenario = "normal";
  const { home, routes, now } = await loadOwnHome(demo);
  const failedRun = home.kind === "ready" && home.lastRun?.ok === false ? home.lastRun : null;
  const cars = home.kind === "ready" ? home.cars : [];
  // The primary car, as loadHome picks it: the first with a VIN. The odometer is its.
  const primaryId = cars.find((car) => car.vehicle.vin)?.vehicle.id;

  return (
    <>
      <OwnerNotices data={home} count={cars.length} failedRun={failedRun} />
      {home.kind === "ready" && cars.length > 0 && (
        <div className="space-y-12">
          {cars.map((car) => (
            <div key={car.vehicle.id} className="space-y-6">
              <CarNotices notices={car.notices} />
              <NowStrip
                car={car}
                odometerKm={car.vehicle.id === primaryId ? home.figures.odometerKm : null}
                parkedNow={car.vehicle.id === primaryId ? home.window.driving.parkedNow : null}
                now={now}
              />
            </div>
          ))}
          <PeriodScope>
            <Totals home={home} routes={routes} now={now} />
          </PeriodScope>
          {cars.some((car) => car.latest?.error) && (
            <p className="text-sm text-muted-foreground">The car went to sleep during the last check. Uplink will try again.</p>
          )}
        </div>
      )}
      {home.kind === "ready" && (
        <CheckedFooter syncedAt={newestTime(cars.flatMap((car) => [car.latest?.polled_at, car.streamAt]))} now={now} lastRun={home.lastRun} showError={cars.length > 0} />
      )}
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
        <div className={`h-12 w-40 ${block}`} />
        <div className={`h-1 w-full max-w-sm ${block}`} />
        <div className={`h-4 w-48 ${block}`} />
      </div>
      <div className="space-y-6">
        <div className={`h-8 w-64 ${block}`} />
        <div className="grid grid-cols-2 gap-px border bg-border bg-clip-padding dark:border-transparent dark:bg-background sm:grid-cols-4">
          {[0, 1, 2, 3].map((k) => (
            <div key={k} className="space-y-2 bg-background p-3 sm:p-4 dark:bg-card">
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

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6 pb-12 sm:pt-8 sm:pb-20">
      <Header />
      <h1 className="sr-only">Your car</h1>
      <Suspense fallback={<HomeSkeleton />}>
        <HomeContent />
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
