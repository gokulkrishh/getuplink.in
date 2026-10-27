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
import { WeekTips, WeekTipsSkeleton } from "@/components/home/week-tips";
import { quietWeek, type WeekFacts, weekFacts } from "@/lib/week-wording";
import { generateWeekTips, loadWeekTips } from "@/lib/server/week-wording";
import { newestTime } from "@/lib/last-synced";
import { rotationNotice, tyreRotation } from "@/lib/tyre-rotation";
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

// Today's AI tips on the week (lib/server/week-wording.ts): the stored ones, or none and some written
// after the response for the next visit.
async function Tips({ vehicleId, day, facts }: { vehicleId: string; day: number; facts: WeekFacts }) {
  // Outside the cached scope, the session check reads the clock, so this part renders per request.
  await connection();
  const owner = await currentOwner();
  if (!owner) return null;
  const key = { vehicleId, day };
  const stored = await loadWeekTips(owner, key, facts);
  if (stored.generate) after(() => generateWeekTips(owner, key, facts));
  return <WeekTips tips={stored.tips} />;
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
  const facts = weekFacts(frames[0].frame, frames[0].driving, window.driving.drives, bills, energyIn(home.sessions, streamOnly, frames[0].frame.span));
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
        {/* The AI's tips on the week stream in after the rest, in a box of the same size. */}
        {/* A quiet week has no tips, so no box. */}
        {primaryId && !quietWeek(facts) && (
          <Suspense fallback={<WeekTipsSkeleton />}>
            <Tips vehicleId={primaryId} day={istDayStart(istDay(now))} facts={facts} />
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
              <CarNotices notices={car.vehicle.id === primaryId ? [...car.notices, ...rotationNotice(tyreRotation(home.figures.odometerKm))] : car.notices} />
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

// Shown while the page loads: faint blocks in the shape of the car strip, the greeting, the tiles and the
// tips, built from the same classes so nothing moves when the page arrives. Each line holds placeholder
// words in a transparent colour, so it takes the real line's height. Sized for the usual state: no update
// on its way (the version is one line) and tiles with a comparison under each value.
function HomeSkeleton() {
  const line = "bg-muted text-transparent motion-safe:animate-pulse";
  return (
    <div role="status" aria-busy="true" className="space-y-12">
      <span className="sr-only">Loading…</span>
      <div className="space-y-5" aria-hidden="true">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <p className="text-sm"><span className={line}>Tesla · Model Y, Pearl White</span></p>
          <p className="min-h-5.5 text-sm"><span className={line}>Asleep, checked 5 min ago</span></p>
        </div>
        <p className="-mt-3 text-sm"><span className={line}>2026.38.4 · 3,434.9 km</span></p>
        <div className="space-y-3">
          <p className="font-mono text-[2.25rem] font-medium"><span className={line}>67%</span></p>
          <div className="h-0.5 max-w-60 bg-border" />
          <p className="text-sm"><span className={line}>Parked 2 h 10 min · Limit 80%</span></p>
        </div>
      </div>
      <div className="space-y-6" aria-hidden="true">
        <div className="space-y-1">
          <p className="text-xl"><span className={line}>Good afternoon</span></p>
          <p className="text-sm"><span className={line}>Here&apos;s your car&apos;s last 7 days, 21 Oct to 27 Oct.</span></p>
        </div>
        <div className="h-[391px] border bg-muted/40 motion-safe:animate-pulse sm:h-[174px]" />
        <WeekTipsSkeleton />
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
