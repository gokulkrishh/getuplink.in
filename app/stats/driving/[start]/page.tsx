import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Header } from "@/components/header";
import { DriveTrace } from "@/components/stats/drive-trace";
import { formatClock, formatDate, formatDuration, formatKm, formatKwh } from "@/lib/format";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { type DriveDetail, loadDriveDetail } from "@/lib/server/drive-detail";

export const metadata: Metadata = { title: "Drive · Uplink" };

const oneDecimal = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

// Session check plus data in one browser-only private cache, like the other pages (see app/page.tsx).
async function loadDetail(start: number): Promise<DriveDetail | null> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  // The clock is read inside the cache; reading it while rendering blocks prerendering.
  return loadDriveDetail(start, Date.now());
}

// One drive: its numbers, then the battery and (once streamed) speed over the drive. No route: Uplink
// doesn't keep where the car goes.
function Drive({ detail }: { detail: DriveDetail }) {
  const { drive: d, battery, speed, rangeUsedKm, topKmh, outsideC } = detail;
  const hours = (d.end - d.start) / 3_600_000;
  const rows: [string, string | null][] = [
    ["Distance", formatKm(d.km)],
    ["Duration", formatDuration(hours * 3600)],
    ["Energy used", d.kwh !== null ? formatKwh(d.kwh) : null],
    ["Battery", d.startLevel !== null && d.endLevel !== null ? `${Math.round(d.startLevel)}% to ${Math.round(d.endLevel)}%` : null],
    ["Range used", rangeUsedKm !== null ? `${Math.round(rangeUsedKm)} km` : null],
    ["Average speed", hours > 0 ? `${Math.round(d.km / hours)} km/h` : null],
    ["Top speed", topKmh !== null ? `${Math.round(topKmh)} km/h` : null],
    ["Outside", outsideC !== null ? `${oneDecimal.format(outsideC)} °C` : null],
  ];
  const shown = rows.filter((r): r is [string, string] => r[1] !== null);
  return (
    <>
      <h1 className="text-2xl font-medium tracking-heading">Drive</h1>
      <p className="mt-2 mb-12 text-sm text-muted-foreground tabular-nums">
        {formatDate(d.start)} · {formatClock(d.start)} to {formatClock(d.end)}
      </p>
      <div className="space-y-12">
        <section className="space-y-4">
          <h2 className="text-xs font-medium tracking-wide text-faint uppercase">Drive</h2>
          <dl className="divide-y border-t">
            {shown.map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-4 py-3 text-sm">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-mono font-medium tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
        {speed.length >= 2 && (
          <section className="space-y-4">
            <h2 className="text-xs font-medium tracking-wide text-faint uppercase">Speed</h2>
            <DriveTrace points={speed} from={d.start} to={d.end} unit="km/h" label="Speed" />
          </section>
        )}
        {battery.length >= 2 && (
          <section className="space-y-4">
            <h2 className="text-xs font-medium tracking-wide text-faint uppercase">Battery</h2>
            <DriveTrace points={battery} from={d.start} to={Math.max(d.end, battery.at(-1)!.t)} unit="%" label="Battery level" max={100} />
          </section>
        )}
        {(topKmh === null || outsideC === null) && (
          <p className="text-xs text-faint">Speed and outside temperature show here once your car streams them.</p>
        )}
      </div>
    </>
  );
}

async function DriveLoader({ params }: { params: Promise<{ start: string }> }) {
  const { start } = await params;
  if (!/^\d{12,14}$/.test(start)) notFound();
  const detail = await loadDetail(Number(start));
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

export default function Page({ params }: PageProps<"/stats/driving/[start]">) {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6 pb-12 sm:pt-8 sm:pb-20">
      <Header />
      <Suspense fallback={<DriveSkeleton />}>
        <DriveLoader params={params} />
      </Suspense>
    </div>
  );
}
