import { chargeStops, driveStops } from "@/lib/bar-stops";
import { cacheLife, cacheTag } from "next/cache";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SyncStreamSessions, SyncStreamVersions } from "@/components/background-sync";
import { Header } from "@/components/header";
import { SkBlock, SkHead, SkSection } from "@/components/skeleton";
import { Headline } from "@/components/home/headline";
import { NowStrip } from "@/components/home/now-strip";
import { Recently } from "@/components/home/recently";
import { ChargeLevelChart } from "@/components/stats/charge-level";
import { CarNotices, CheckedFooter, OwnerNotices, WeekNotice } from "@/components/owner-notices";
import { eachFrame } from "@/components/home/frames";
import { PeriodScope } from "@/components/stats/period-scope";
import { matchSessions } from "@/lib/charge-sessions";
import { chargingBills, firstStartedAt } from "@/lib/charging-figures";
import { withDriveEfficiency } from "@/lib/drive-stats";
import { periodFrames } from "@/lib/frames";
import { hasNoHistory } from "@/lib/dashboard-summary";
import { daysLabel } from "@/lib/periods";
import { istDay, istDayStart } from "@/lib/telemetry-derive";
import { AiNotesSkeleton } from "@/components/home/week-tips";
import { TipsBox } from "@/components/tips-box";
import { batteryFindings } from "@/lib/battery-tips";
import { averagePrice, pricedCharges } from "@/lib/charge-tips";
import { WEEK_TIPS, weekFindings } from "@/lib/week-wording";
import { newestTime } from "@/lib/last-synced";
import { recentlyLines } from "@/lib/recently";
import { rotationDueAt, rotationNotice, tyreRotation } from "@/lib/tyre-rotation";
import { RotationNotice } from "@/components/home/rotation-notice";
import { ShareNudgeCard } from "@/components/home/share-nudge";
import { shareNudgeCheck } from "@/lib/server/share-nudge";
import type { DemoScenario } from "@/lib/demo";
import { currentOwner, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { type HomeCar, type HomeNow, type HomeWeek, loadHomeNow, loadHomeWeek } from "@/lib/server/home";

type Ready<T> = Extract<T, { kind: "ready" }>;

// The session check and the data share one private scope: the result lives only in this browser's
// router cache (never a server cache), so a header link's prefetch can carry it. The check still runs
// on every server render; redirect() throws, so a signed-out result is never cached. The demo
// scenario is an argument, so each one gets its own entry; the period is not, since it switches in the
// browser. The page has two such scopes, loaded side by side: the car strip's (quick) and the week's (the
// 90-day read), so the strip shows without waiting for the week.
// shareCard: whether the card asking the owner to share shows (lib/share-nudge.ts), decided with the strip
// so it is known before the tiles render and nothing below it moves. Not now and Share refresh this cache
// (updateTag).
async function loadOwnCar(demo: DemoScenario): Promise<{ home: HomeNow; now: number; shareCard: boolean }> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  // 60s is enough for a per-link prefetch (30s minimum); the App Shell would need 5 minutes.
  cacheLife({ stale: 60 });
  const owner = await currentOwner();
  if (!owner) redirect(SIGNED_OUT_PATH);
  // The clock is read here, inside the cache, because reading it while rendering blocks prerendering.
  const now = Date.now();
  const [home, shareCheck] = await Promise.all([loadHomeNow(owner, demo, now), shareNudgeCheck(owner)]);
  const shareCard = home.kind === "ready" && shareCheck(home.figures.since, now);
  return { home, now, shareCard };
}

// The week's part, in its own private scope, cached and refreshed exactly as the strip's. The page draws
// both with the strip's clock; the two read it a moment apart.
async function loadOwnWeek(demo: DemoScenario): Promise<HomeWeek> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  const owner = await currentOwner();
  if (!owner) redirect(SIGNED_OUT_PATH);
  return loadHomeWeek(owner, demo, Date.now());
}

type WeekLoad = Promise<HomeWeek>;

// "Good morning" before noon, "Good afternoon" until 5 PM, "Good evening" after, India time.
function greeting(now: number): string {
  const hour = new Date(now + 330 * 60_000).getUTCHours();
  return hour >= 4 && hour < 12 ? "Good morning" : hour >= 12 && hour < 17 ? "Good afternoon" : "Good evening";
}

// A glance at the last 7 days: the four headline numbers, the tips and the charge level. Each tile leads to its Stats tab.
function Totals({ home, now, shareCard }: { home: Ready<HomeNow> & Ready<HomeWeek>; now: number; shareCard: boolean }) {
  const { streamOnly } = matchSessions(home.sessions, home.streamSessions, now);
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
  // What a day's bar opens when the day held one drive or one charge (see barOpens).
  const { pairs } = matchSessions(home.sessions, home.streamSessions, now);
  const stops = {
    driving: driveStops(window.driving.drives, now),
    charging: chargeStops([...pairs.map((p) => ({ started_at: p.tesla.started_at, stream: p.stream })), ...streamOnly.map((s) => ({ started_at: s.started_at, stream: s }))]),
  };
  // The tips' findings (lib/week-wording.ts), with the week's heaviest parked stretch from the Battery tips
  // when it drew far more than usual. Ranked together; the model sees the top few.
  const { frame } = frames[0];
  const priced = pricedCharges(home.sessions, streamOnly, home.invoices);
  const findings = [
    ...weekFindings({ frame, driving: frames[0].driving, drives: window.driving.drives, priced, parked: window.driving.parked, charges: home.streamSessions, odometerKm: home.figures.odometerKm, now }),
    ...batteryFindings({ parked: window.driving.parked, presence: [], level: [], avgPrice: averagePrice(priced), now, heavyFrom: frame.span.from }).filter((f) => f.kind === "heavyDrain"),
  ];
  const today = istDayStart(istDay(now));
  return (
    <div className="space-y-12">
      <section aria-label="Totals" className="space-y-6">
        {/* A greeting by the time of day in India, then the week it covers: the period, named once. */}
        <div className="space-y-1">
          <h2 className="text-xl font-medium tracking-heading">{greeting(now)}</h2>
          {/* A car with no history has no week to name: its card says it is getting started. */}
          {!hasNoHistory(figures.since, chargingSince, home.lastReadingAt) && (
            <p className="text-sm text-muted-foreground">
              Here&apos;s {carName ? `${carName}'s` : "your"} last 7 days, {daysLabel(istDay(frames[0].frame.span.from), istDay(Math.min(frames[0].frame.span.to - 1, now)), now)}.
            </p>
          )}
        </div>
        {eachFrame(
          frames,
          ({ key, frame, driving }) => (
            <Headline key={key} frame={frame} driving={driving} since={figures.since} now={now} sessions={home.sessions} streamOnly={streamOnly} bills={bills} chargingSince={chargingSince} lastReadingAt={home.lastReadingAt} stops={stops} />
          ),
          { steady: true },
        )}
        {/* The card asking the owner to share, when it's due, right under the week's tiles. Always mounted, so
            its "You're sharing" note outlives the refresh that drops the card once sharing is on. */}
        <ShareNudgeCard show={shareCard} />
        {/* The AI's tips on the week stream in after the rest, in a box of the same size. */}
        {/* A quiet week has no tips, so no box. */}
        {primaryId && findings.length > 0 && (
          <Suspense fallback={<AiNotesSkeleton />}>
            <TipsBox surface={WEEK_TIPS} vehicleId={primaryId} at={today} daily entity={String(today)} findings={findings} />
          </Suspense>
        )}
      </section>
      {/* The week in one picture: the level drops as the car drives and rises as it charges. The rest is a tap away on Stats. */}
      <ChargeLevelChart level={window.level} now={now} frame={frame} />
    </div>
  );
}

// The tyre rotation due now, if any, as a notice the owner can dismiss once it's done.
function TyreNotice({ odometerKm }: { odometerKm: number | null }) {
  const r = tyreRotation(odometerKm);
  const at = rotationDueAt(r);
  return at === null ? null : <RotationNotice atKm={at} text={rotationNotice(r)[0]} />;
}

// The primary car's strip once the week's read says when it parked. A car charging isn't "parked now", even
// before the stations job has built its session from the readings (every 15 minutes), so it never waits.
async function PrimaryStrip({ car, odometerKm, now, week }: { car: HomeCar; odometerKm: number | null; now: number; week: WeekLoad }) {
  const w = await week;
  return <NowStrip car={car} odometerKm={odometerKm} parkedNow={w?.kind === "ready" ? w.window.driving.parkedNow : null} now={now} holdRow />;
}

// The last 24 hours' drive and charge, from the week's read.
async function RecentFor({ vin, now, week }: { vin: string; now: number; week: WeekLoad }) {
  const w = await week;
  return w?.kind === "ready" ? <Recently items={recentlyLines(w.window.driving.drives, w.streamSessions, now, vin)} /> : null;
}

// The week's totals, tips and charge level. When the week can't be read (or the account changed between
// the two reads) the strip stays, with a notice naming the week, not the car shown above it.
async function WeekTotals({ home, now, shareCard, week }: { home: Ready<HomeNow>; now: number; shareCard: boolean; week: WeekLoad }) {
  const w = await week;
  if (w?.kind !== "ready") return <WeekNotice />;
  return (
    <PeriodScope>
      <Totals home={{ ...home, ...w }} now={now} shareCard={shareCard} />
    </PeriodScope>
  );
}

// What sits under the totals lands with the week's read, so it never moves when they arrive.
async function WithWeek({ week, children }: { week: WeekLoad; children: React.ReactNode }) {
  await week.then(
    () => undefined,
    () => undefined,
  );
  return children;
}

async function HomeContent() {
  // Only demo mode reads the scenario, so the real page stays as it was.
  const demo: DemoScenario = "normal";
  // Both parts start now; the strip renders as soon as its part is in, and the week's streams in after.
  const week = loadOwnWeek(demo);
  // Its parts handle a failure; this only keeps a sign-out (both redirect) from going unhandled here.
  week.catch(() => {});
  const { home, now, shareCard } = await loadOwnCar(demo);
  const failedRun = home.kind === "ready" && home.lastRun?.ok === false ? home.lastRun : null;
  const cars = home.kind === "ready" ? home.cars : [];
  // The primary car, as loadHomeNow picks it: the first with a VIN. The odometer is its.
  const primaryId = cars.find((car) => car.vehicle.vin)?.vehicle.id;

  return (
    <>
      <OwnerNotices data={home} count={cars.length} failedRun={failedRun} />
      {home.kind === "ready" && cars.length > 0 && (
        <div className="space-y-12">
          {cars.map((car) => (
            <div key={car.vehicle.id} className="space-y-6">
              <CarNotices notices={car.notices} />
              {car.vehicle.id === primaryId && <TyreNotice odometerKm={home.figures.odometerKm} />}
              {car.vehicle.id === primaryId && car.lastOnline?.charging_state !== "Charging" && home.lastReadingAt !== null ? (
                // Until the week's read says when it parked, a faint line holds the parked line's place. A car that
                // never sent data has no parked line coming, so it doesn't wait and keeps no empty row.
                <Suspense fallback={<NowStrip car={car} odometerKm={home.figures.odometerKm} parkedNow="pending" now={now} />}>
                  <PrimaryStrip car={car} odometerKm={home.figures.odometerKm} now={now} week={week} />
                </Suspense>
              ) : (
                <NowStrip car={car} odometerKm={car.vehicle.id === primaryId ? home.figures.odometerKm : null} parkedNow={null} now={now} />
              )}
              {/* From the week's read, so it lands in the same paint as the totals below. */}
              {car.vehicle.id === primaryId && (
                <Suspense>
                  <RecentFor vin={car.vehicle.vin ?? ""} now={now} week={week} />
                </Suspense>
              )}
            </div>
          ))}
          <Suspense fallback={<TotalsSkeleton />}>
            <WeekTotals home={home} now={now} shareCard={shareCard} week={week} />
          </Suspense>
          {cars.some((car) => car.latest?.error) && (
            <Suspense>
              <WithWeek week={week}>
                <p className="text-sm text-muted-foreground">The car went to sleep during the last check. Uplink will try again.</p>
              </WithWeek>
            </Suspense>
          )}
        </div>
      )}
      {home.kind === "ready" && (
        <Suspense>
          <WithWeek week={week}>
            <CheckedFooter syncedAt={newestTime(cars.flatMap((car) => [car.latest?.polled_at, car.streamAt]))} now={now} />
          </WithWeek>
        </Suspense>
      )}
    </>
  );
}

// Shown while the page loads: faint blocks in the shape of the car strip, the greeting, the tiles and the
// tips, built from the same classes so nothing moves when the page arrives. Each line holds placeholder
// words in a transparent colour, so it takes the real line's height. Sized for the usual state: no update
// on its way (the version is one line) and tiles with a comparison under each value.
// The strip and the week load apart, so each has its own part here; together they are the whole page's.
function HomeSkeleton() {
  return (
    <div className="space-y-12">
      <StripSkeleton />
      <TotalsSkeleton />
    </div>
  );
}

const line = "bg-muted text-transparent motion-safe:animate-pulse";

// The car's strip: NowStrip's own row, with BatteryGauge's own track on the right from sm up.
function StripSkeleton() {
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-8" aria-hidden="true">
      <div className="min-w-0 space-y-1 sm:flex-1">
        <p className="truncate text-sm"><span className={line}>Demo car · Model Y, Pearl White</span></p>
        <p className="flex items-center gap-2 text-sm"><span className={line}>2026.38.4 · 3,434.9 km</span></p>
        <p className="text-sm"><span className={line}>Synced 5 min ago</span></p>
      </div>
      <div className="space-y-1 sm:w-60 sm:shrink-0">
        <p className="flex h-5 items-baseline gap-x-2 leading-5 sm:justify-end">
          <span className="font-mono text-base font-medium"><span className={line}>67%</span></span>
          <span className="text-sm"><span className={line}>About 294 km</span></span>
        </p>
        <div className="flex h-5 items-center gap-2">
          <div className="relative h-0.5 w-full max-w-60 min-w-0 flex-1 bg-border">
            <div className="h-full w-2/3 bg-muted-foreground/30 motion-safe:animate-pulse" />
            <span className="absolute -top-1 h-2.5 w-px bg-muted-foreground/40" style={{ left: "80%" }} />
          </div>
          <span className="shrink-0 text-xs leading-none"><span className={line}>Limit 80%</span></span>
        </div>
        <p className="flex items-center gap-1.5 text-sm sm:justify-end"><span className={line}>Parked since 3:30 PM</span></p>
      </div>
    </div>
  );
}

// The week: the greeting, the tiles and the tips, then the charge level. Shown alone under the strip
// while the week streams in, in Totals' own outer box.
function TotalsSkeleton() {
  return (
    <div role="status" aria-busy="true" className="space-y-12">
      <span className="sr-only">Loading…</span>
      <div className="space-y-6" aria-hidden="true">
        <div className="space-y-1">
          <p className="text-xl"><span className={line}>Good afternoon</span></p>
          <p className="text-sm"><span className={line}>Here&apos;s your car&apos;s last 7 days, 21 Oct to 27 Oct.</span></p>
        </div>
        <div className="h-[391px] border bg-muted/40 motion-safe:animate-pulse sm:h-[174px]" />
        <AiNotesSkeleton />
      </div>
      {/* The charge level chart below, its heading and a block of its usual height. */}
      <SkSection>
        <SkHead title="Charge level" description="Battery level over time, with charging marked." />
        <SkBlock className="h-[330px] border bg-muted/40 sm:h-[260px]" />
      </SkSection>
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
