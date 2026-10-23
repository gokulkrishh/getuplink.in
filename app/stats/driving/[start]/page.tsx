import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Header } from "@/components/header";
import { DriveTrace } from "@/components/stats/drive-trace";
import { TripMap } from "@/components/stats/trip-map";
import { TripTimeline } from "@/components/stats/trip-timeline";
import { formatClock, formatDate, formatDuration, formatKm, formatKwh } from "@/lib/format";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { type DriveDetail, loadDriveDetail } from "@/lib/server/drive-detail";

export const metadata: Metadata = { title: "Trip · Uplink" };

const oneDecimal = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

// Session check plus data in one browser-only private cache, like the other pages (see app/page.tsx).
async function loadDetail(start: number, leg: boolean): Promise<DriveDetail | null> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  // The clock is read inside the cache; reading it while rendering blocks prerendering.
  return loadDriveDetail(start, Date.now(), leg);
}

// One trip on one page: a single drive, or drives with short stops between (see groupTrips). Its totals,
// the route on a map with its start, stops and end, a timeline of legs and stops, then the battery and
// speed across the whole trip.
function Drive({ detail }: { detail: DriveDetail }) {
  const { trip, battery, speed, rangeUsedKm, topKmh, outsideC, route, pins } = detail;
  const drivingMs = trip.legs.reduce((sum, d) => sum + (d.end - d.start), 0);
  const stoppedMs = trip.end - trip.start - drivingMs;
  const tiles: { label: string; value: string; note?: string; level?: [number, number] }[] = [
    ...(trip.kwh !== null ? [{ label: "Energy used", value: formatKwh(trip.kwh) }] : []),
    ...(trip.startLevel !== null && trip.endLevel !== null
      ? [{ label: "Battery", value: `${Math.round(trip.startLevel)}% to ${Math.round(trip.endLevel)}%`, level: [trip.startLevel, trip.endLevel] as [number, number] }]
      : []),
    ...(rangeUsedKm !== null ? [{ label: "Range used", value: `${Math.round(rangeUsedKm)} km` }] : []),
    ...(drivingMs > 0 ? [{ label: "Average speed", value: `${Math.round(trip.km / (drivingMs / 3_600_000))} km/h`, note: trip.stops ? "while driving" : undefined }] : []),
    ...(topKmh !== null ? [{ label: "Top speed", value: `${Math.round(topKmh)} km/h` }] : []),
    ...(outsideC !== null ? [{ label: "Outside", value: `${oneDecimal.format(outsideC)} °C` }] : []),
  ];
  const summary = [
    formatDuration((trip.end - trip.start) / 1000),
    trip.stops ? `${formatDuration(drivingMs / 1000)} driving` : null,
    trip.stops ? `${trip.stops} ${trip.stops === 1 ? "stop" : "stops"}, ${formatDuration(stoppedMs / 1000)}` : null,
  ].filter(Boolean);
  const traceEnd = Math.max(trip.end, battery.at(-1)?.t ?? trip.end);
  return (
    <>
      <h1 className="text-2xl font-medium tracking-heading">{trip.stops ? "Trip" : "Drive"}</h1>
      <p className="mt-2 mb-12 text-sm text-muted-foreground tabular-nums">
        {formatDate(trip.start)} · {formatClock(trip.start)} to {formatClock(trip.end)}
      </p>
      <div className="space-y-12">
        {/* The headline, then a few numbers as tiles: easier to take in than a long list. */}
        <section className="space-y-6">
          <div className="space-y-1">
            <p className="font-mono text-4xl font-medium tracking-tight tabular-nums">{formatKm(trip.km)}</p>
            <p className="text-sm text-muted-foreground tabular-nums">{summary.join(" · ")}</p>
          </div>
          {tiles.length > 0 && (
            <dl className="grid grid-cols-2 gap-px border bg-border bg-clip-padding sm:grid-cols-4">
              {tiles.map((t) => (
                <div key={t.label} className="space-y-1.5 bg-background p-4">
                  <dt className="text-xs tracking-wide text-faint uppercase">{t.label}</dt>
                  <dd className="font-mono text-lg font-medium tabular-nums">{t.value}</dd>
                  {t.level && (
                    <div className="relative h-1 bg-muted" aria-hidden="true">
                      <div className="absolute inset-y-0 left-0 bg-muted-foreground/40" style={{ width: `${t.level[0]}%` }} />
                      <div className="absolute inset-y-0 left-0 bg-chart-accent" style={{ width: `${t.level[1]}%` }} />
                    </div>
                  )}
                  {t.note && <p className="text-xs text-muted-foreground">{t.note}</p>}
                </div>
              ))}
            </dl>
          )}
        </section>
        <section className="space-y-4">
          <h2 className="text-xs font-medium tracking-wide text-faint uppercase">Map</h2>
          {route.length >= 2 ? (
            <TripMap route={route} pins={pins} />
          ) : (
            <p className="text-sm text-muted-foreground">The map shows for trips after your car starts streaming its location.</p>
          )}
        </section>
        {trip.stops > 0 && (
          <section className="space-y-4">
            <h2 className="text-xs font-medium tracking-wide text-faint uppercase">Timeline</h2>
            <TripTimeline legs={trip.legs} />
          </section>
        )}
        {speed.length >= 2 && (
          <section className="space-y-4">
            <h2 className="text-xs font-medium tracking-wide text-faint uppercase">Speed</h2>
            <DriveTrace points={speed} from={trip.start} to={trip.end} unit="km/h" label="Speed" />
          </section>
        )}
        {battery.length >= 2 && (
          <section className="space-y-4">
            <h2 className="text-xs font-medium tracking-wide text-faint uppercase">Battery</h2>
            <DriveTrace points={battery} from={trip.start} to={traceEnd} unit="%" label="Battery level" max={100} />
          </section>
        )}
        {(topKmh === null || outsideC === null) && (
          <p className="text-xs text-faint">Speed and outside temperature show here once your car streams them.</p>
        )}
      </div>
    </>
  );
}

async function DriveLoader({ params, searchParams }: Pick<PageProps<"/stats/driving/[start]">, "params" | "searchParams">) {
  const [{ start }, query] = await Promise.all([params, searchParams]);
  if (!/^\d{12,14}$/.test(start)) notFound();
  const detail = await loadDetail(Number(start), query.leg !== undefined);
  if (!detail) notFound();
  return <Drive detail={detail} />;
}

function DriveSkeleton() {
  const block = "bg-muted motion-safe:animate-pulse";
  return (
    <div role="status" className="space-y-12">
      <span className="sr-only">Loading…</span>
      <div className={`h-8 w-48 ${block}`} />
      <div className={`h-64 w-full ${block}`} />
    </div>
  );
}

export default function Page({ params, searchParams }: PageProps<"/stats/driving/[start]">) {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6 pb-12 sm:pt-8 sm:pb-20">
      <Header />
      <Suspense fallback={<DriveSkeleton />}>
        <DriveLoader params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
