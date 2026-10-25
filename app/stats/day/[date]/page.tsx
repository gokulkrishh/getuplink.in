import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Header } from "@/components/header";
import { DayTimeline } from "@/components/stats/day-timeline";
import { TripTable } from "@/components/stats/drive-list";
import { Figures } from "@/components/stats/figures";
import { TripMap } from "@/components/stats/trip-map";
import { buttonVariants } from "@/components/ui/button";
import { formatClock, formatKwh, formatMoney } from "@/lib/format";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { type DayDetail, loadDay } from "@/lib/server/day";
import { dayParam } from "@/lib/day-timeline";
import { istDay, istDayStart } from "@/lib/telemetry-derive";

export const metadata: Metadata = { title: "Day · Uplink" };

const long = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const oneDecimal = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

// Session check plus data in one browser-only private cache, like the other pages (see app/page.tsx).
async function loadDetail(day: number): Promise<{ detail: DayDetail | null; now: number }> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  const now = Date.now();
  return { detail: await loadDay(day, now), now };
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
  const km = detail.trips.reduce((s, t) => s + t.km, 0);
  const used = detail.trips.every((t) => t.kwh !== null) ? detail.trips.reduce((s, t) => s + (t.kwh ?? 0), 0) : null;
  const added = detail.charges.reduce((s, c) => s + (c.session.energy_added_kwh ?? 0), 0);
  const spent = detail.charges.reduce((s, c) => s + (c.cost ?? 0), 0);
  const tiles: [string, string][] = [
    ["Driven", `${oneDecimal.format(km)} km`],
    ["Energy used", used !== null ? formatKwh(used) : "Unknown"],
    ["Charged", formatKwh(added)],
    ["Spent", formatMoney(spent, "INR")],
  ];
  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium tracking-heading">{long.format(istDayStart(detail.day) + 12 * 3_600_000)}</h1>
          <p className="mt-2 text-sm text-muted-foreground tabular-nums">
            {detail.trips.length} {detail.trips.length === 1 ? "trip" : "trips"} · {detail.charges.length} {detail.charges.length === 1 ? "charge" : "charges"}
          </p>
        </div>
        <DayNav detail={detail} />
      </div>
      <div className="mt-12 space-y-12">
        <Figures figures={tiles.map(([label, value]) => ({ label, value }))} />
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
            <TripTable trips={detail.trips} serialOf={(t) => detail.trips.length - detail.trips.indexOf(t)} now={now} />
          </section>
        )}
        {detail.charges.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-lg font-medium tracking-heading">Charges</h2>
            <ul className="divide-y border-t text-sm tabular-nums">
              {detail.charges.map(({ session: s, cost }) => (
                <li key={s.id} className="relative flex items-baseline justify-between gap-4 py-3">
                  <span>
                    <Link href={`/stats/charging/${s.id}`} className="after:absolute after:inset-0 hover:underline hover:underline-offset-4">
                      {formatClock(s.started_at)}
                      {s.ended_at ? ` to ${formatClock(s.ended_at)}` : ", charging"}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{[s.supercharger ? "Supercharger" : s.kind.toUpperCase(), s.station_name].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="text-right font-mono">
                    {s.energy_added_kwh !== null ? formatKwh(s.energy_added_kwh) : ""}
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  const day = istDay(Date.parse(`${date}T12:00:00+05:30`));
  if (!Number.isFinite(day)) notFound();
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
