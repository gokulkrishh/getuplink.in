import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Header } from "@/components/header";
import { DayTimeline } from "@/components/stats/day-timeline";
import { TripTable } from "@/components/stats/drive-list";
import { type Figure, Figures } from "@/components/stats/figures";
import { TripMap } from "@/components/stats/trip-map";
import { buttonVariants } from "@/components/ui/button";
import { DECIMALS, formatClock, formatKm, formatKwh, formatMoney, shownTotal } from "@/lib/format";
import { shownTrips } from "@/lib/trips";
import { currentOwner, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { type DayDetail, loadDay } from "@/lib/server/day";
import { dayParam } from "@/lib/day-timeline";
import { chargeTotals } from "@/lib/charging-figures";
import { isoDay } from "@/lib/periods";
import { istDayStart } from "@/lib/telemetry-derive";
import { Measure } from "@/components/measure";

export const metadata: Metadata = { title: "Day · Uplink" };

const long = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

// Session check plus data in one browser-only private cache, like the other pages (see app/page.tsx).
async function loadDetail(day: number): Promise<{ detail: DayDetail | null; now: number }> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  const owner = await currentOwner();
  if (!owner) redirect(SIGNED_OUT_PATH);
  const now = Date.now();
  return { detail: await loadDay(owner, day, now), now };
}

function DayNav({ detail }: { detail: DayDetail }) {
  const arrow = (day: number | null, label: string, Icon: typeof ChevronLeft) =>
    day === null ? (
      <span className={buttonVariants({ variant: "outline", size: "icon" })} aria-hidden="true" style={{ opacity: 0.3 }}>
        <Icon />
      </span>
    ) : (
      <Link href={`/stats/day/${dayParam(day)}`} aria-label={label} className={buttonVariants({ variant: "outline", size: "icon" })}>
        <Icon />
      </Link>
    );
  return (
    <div className="flex gap-2">
      {arrow(detail.prev, "Previous day", ChevronLeft)}
      {arrow(detail.next, "Next day", ChevronRight)}
    </div>
  );
}

// One day: what you drove and charged, when, and where. Previous and next step through the days.
function DayView({ detail, now }: { detail: DayDetail; now: number }) {
  // The trips and the charges are rounded together with their totals (see shownTotal), so the rows below
  // add up to the tiles as shown.
  const { trips, km, kwh: used } = shownTrips(detail.trips);
  const charged = chargeTotals(detail.charges.map((c) => ({ kwh: c.session.energy_added_kwh, cost: c.cost })));
  const chargedKwh = shownTotal(
    detail.charges.map((c) => c.session.energy_added_kwh),
    DECIMALS.kWh,
  );
  // Spent is the same bills total as Stats > Charging; charges without a bill are noted under it.
  const tiles: Figure[] = [
    { label: "Driven", value: formatKm(km) },
    { label: "Energy used", value: used !== null ? formatKwh(used) : "Unknown" },
    { label: "Charged", value: charged.kwh !== null ? formatKwh(chargedKwh.total) : "Unknown" },
    { label: "Spent", value: formatMoney(detail.spent, "INR"), note: charged.unbilled > 0 ? `${charged.unbilled} without a bill` : undefined },
  ];
  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[1.5rem] font-medium tracking-heading max-sm:text-[1.25rem]">{long.format(istDayStart(detail.day) + 12 * 3_600_000)}</h1>
          <p className="mt-2 text-sm text-muted-foreground tabular-nums">
            {detail.trips.length} {detail.trips.length === 1 ? "trip" : "trips"} · {detail.charges.length} {detail.charges.length === 1 ? "charge" : "charges"}
          </p>
        </div>
        <DayNav detail={detail} />
      </div>
      <div className="mt-12 space-y-12">
        <Figures figures={tiles} />
        <DayTimeline days={[detail.strip]} now={now} title="Timeline" />
        {detail.route.length >= 2 && (
          <section className="space-y-4">
            <h2 className="text-lg font-medium tracking-heading">Map</h2>
            <TripMap route={detail.route} pins={detail.pins} label="Where the car went this day" />
          </section>
        )}
        {detail.trips.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-lg font-medium tracking-heading">Trips</h2>
            <TripTable trips={trips} serialOf={(t) => trips.length - trips.indexOf(t)} now={now} />
          </section>
        )}
        {detail.charges.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-lg font-medium tracking-heading">Charges</h2>
            <ul className="divide-y border-t text-sm tabular-nums">
              {detail.charges.map(({ session: s, cost }, k) => (
                <li key={s.id} className="relative flex cursor-pointer items-baseline justify-between gap-4 py-3 sm:-mx-3 sm:px-3 transition-colors duration-150 hover:bg-muted focus-within:bg-muted">
                  <span>
                    <Link href={`/stats/charging/${s.id}`} className="outline-none after:absolute after:inset-0">
                      {formatClock(s.started_at)}
                      {s.ended_at ? ` to ${formatClock(s.ended_at)}` : ", charging"}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{[s.supercharger ? "Supercharger" : s.kind.toUpperCase(), s.station_name].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="text-right font-mono">
                    {s.energy_added_kwh !== null && <Measure text={formatKwh(chargedKwh.parts[k] ?? s.energy_added_kwh)} />}
                    {cost !== null && <span className="block text-xs text-muted-foreground">{formatMoney(cost, "INR")}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {detail.trips.length === 0 && detail.charges.length === 0 && <p className="text-sm text-muted-foreground">No drives or charges this day.</p>}
      </div>
    </>
  );
}

async function DayLoader({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  // Only a real date: "2026-02-30" would otherwise roll over to 2 March.
  const day = isoDay(date);
  if (day === null) notFound();
  const { detail, now } = await loadDetail(day);
  if (!detail) notFound();
  return <DayView detail={detail} now={now} />;
}

export default function Page({ params }: PageProps<"/stats/day/[date]">) {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6 pb-12 sm:pt-8 sm:pb-20">
      <Header />
      <Suspense fallback={<div role="status" aria-busy="true" className="h-64 bg-muted motion-safe:animate-pulse"><span className="sr-only">Loading…</span></div>}>
        <DayLoader params={params} />
      </Suspense>
    </div>
  );
}
