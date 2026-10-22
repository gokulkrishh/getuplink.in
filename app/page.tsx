import { cacheLife, cacheTag } from "next/cache";
import { Suspense } from "react";
import { SyncStreamVersions } from "@/components/background-sync";
import { DemoBar } from "@/components/demo-bar";
import { Header } from "@/components/header";
import { CheckedFooter, OwnerNotices } from "@/components/owner-notices";
import { VehicleSection } from "@/components/vehicle-section";
import { DEMO, type DemoScenario, parseScenario } from "@/lib/demo";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { type Dashboard as DashboardData, loadDashboard, OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { redirect } from "next/navigation";

// The session check and the data share one private scope: the result lives only in this browser's
// router cache (never a server cache), so a header link's prefetch can carry it. The check still runs
// on every server render; redirect() throws, so a signed-out result is never cached. The demo
// scenario is an argument, so each one gets its own entry.
async function loadOwnDashboard(demo: DemoScenario): Promise<{ data: DashboardData; now: number }> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  // 60s is enough for a per-link prefetch (30s minimum); the App Shell would need 5 minutes.
  cacheLife({ stale: 60 });
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  // The clock is read here, inside the cache, because reading it while rendering blocks prerendering.
  return { data: await loadDashboard(demo), now: Date.now() };
}

async function Dashboard({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  // Only demo mode reads the query string, so the real dashboard stays as it was.
  const demo = DEMO ? parseScenario((await searchParams).demo) : "normal";
  const { data, now } = await loadOwnDashboard(demo);
  const failedRun = data.kind === "ready" && data.lastRun?.ok === false ? data.lastRun : null;

  return (
    <>
      {DEMO && <DemoBar active={demo} />}
      <OwnerNotices data={data} count={data.kind === "ready" ? data.vehicles.length : 0} failedRun={failedRun} />

      {data.kind === "ready" && data.vehicles.length > 0 && (
        <div className="space-y-24">
          {data.vehicles.map((view) => (
            <VehicleSection key={view.vehicle.id} view={view} notes={data.releaseNotes} now={now} />
          ))}
        </div>
      )}

      {data.kind === "ready" && <CheckedFooter lastRun={data.lastRun} showError={data.vehicles.length > 0} />}
    </>
  );
}

// Shown while the dashboard loads: faint blocks in the shape of a vehicle section.
function DashboardSkeleton() {
  const block = "bg-muted motion-safe:animate-pulse";
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div className="space-y-12">
        <div className="space-y-3">
          <div className={`h-4 w-20 ${block}`} />
          <div className={`h-10 w-56 ${block}`} />
        </div>
        <div className="grid gap-8 sm:grid-cols-3">
          <div className="space-y-2 sm:col-span-2">
            <div className={`h-3 w-14 ${block}`} />
            <div className={`h-4 w-40 ${block}`} />
          </div>
          <div className="space-y-2">
            <div className={`h-3 w-24 ${block}`} />
            <div className={`h-4 w-28 ${block}`} />
          </div>
        </div>
        <div className="space-y-4">
          <div className={`h-3 w-14 ${block}`} />
          <div className={`h-20 w-full ${block}`} />
        </div>
      </div>
    </div>
  );
}

export default function Page({ searchParams }: PageProps<"/">) {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-12 sm:py-20">
      <Header />
      <h1 className="sr-only">Dashboard</h1>
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
      <Suspense>
        <SyncStreamVersions />
      </Suspense>
    </div>
  );
}
