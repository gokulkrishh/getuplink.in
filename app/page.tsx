import Link from "next/link";
import { cacheLife, cacheTag, io } from "next/cache";
import { after } from "next/server";
import { Suspense } from "react";
import { logout } from "@/app/actions";
import { CarFront, Settings2 } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Logo } from "@/components/logo";
import { VehicleSection } from "@/components/vehicle-section";
import { SignInButton } from "@/components/sign-in-button";
import { DEMO, DEMO_SCENARIOS, type DemoScenario, parseScenario } from "@/lib/demo";
import { describeRunError } from "@/lib/run-error";
import { formatDateTime } from "@/lib/format";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { type Dashboard as DashboardData, loadDashboard, OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { syncStreamVersionsForAllCars } from "@/lib/server/stream-versions";
import { redirect } from "next/navigation";

function Header() {
  return (
    <header className="mb-16 flex items-center justify-between gap-4 text-sm">
      <Link href="/" className="flex items-center gap-2.5 font-medium">
        <Logo className="size-5" />
        Uplink
      </Link>
      <nav aria-label="Main" className="flex items-baseline gap-4 text-muted-foreground">
        <Link href="/stats" prefetch={true} className="hover:text-foreground">
          Stats
        </Link>
        <Link href="/settings" prefetch={true} className="hover:text-foreground">
          Settings
        </Link>
        <form action={logout}>
          <button className="cursor-pointer hover:text-foreground">Sign out</button>
        </form>
      </nav>
    </header>
  );
}

// Local demo mode only: switches the car between the states the dashboard can be in.
function DemoBar({ active }: { active: DemoScenario }) {
  return (
    <nav aria-label="Demo scenarios" className="mb-12 flex flex-wrap gap-x-4 gap-y-1 border-y py-3 text-xs text-muted-foreground">
      <span className="text-faint">Demo</span>
      {Object.entries(DEMO_SCENARIOS).map(([key, label]) => (
        <Link key={key} href={`/?demo=${key}`} aria-current={key === active ? "page" : undefined} className={key === active ? "text-foreground" : "hover:text-foreground"}>
          {label}
        </Link>
      ))}
    </nav>
  );
}

function RunError({ error }: { error: string }) {
  return (
    <div className="space-y-2">
      <p>{describeRunError(error)}</p>
      <details className="text-xs">
        <summary className="text-faint hover:text-muted-foreground">Details</summary>
        <p className="mt-2 font-mono break-all text-muted-foreground">{error}</p>
      </details>
    </div>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-medium tracking-heading">{title}</h2>
      <div className="max-w-md space-y-4 text-sm text-muted-foreground">{children}</div>
    </section>
  );
}

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
      {data.kind === "misconfigured" && (
        <EmptyState
          icon={<Settings2 className="size-7 text-faint" aria-hidden="true" />}
          title="Not configured"
          action={
            <ul className="space-y-1 font-mono text-xs text-foreground">
              {data.missing.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          }
        >
          Add these environment variables in your Vercel project settings, then redeploy.
        </EmptyState>
      )}

      {data.kind === "error" && (
        <Notice title="Couldn't load your dashboard">
          <p>Reload the page. If it keeps happening, check the Supabase settings in Vercel.</p>
          <details className="text-xs">
            <summary className="text-faint hover:text-muted-foreground">Details</summary>
            <p className="mt-2 font-mono break-all">{data.message}</p>
          </details>
        </Notice>
      )}

      {data.kind === "disconnected" && (
        <Notice title="Connect your Tesla account">
          <p>
            Uplink needs read-only access to your car&apos;s data. It never wakes the car, so a version appears once the car
            is seen online.
          </p>
          <SignInButton />
        </Notice>
      )}

      {data.kind === "ready" && data.vehicles.length === 0 && (
        failedRun?.error ? (
          <Notice title="Couldn't reach Tesla">
            <RunError error={failedRun.error} />
          </Notice>
        ) : (
          <EmptyState icon={<CarFront className="size-7 text-faint" aria-hidden="true" />} title="No vehicles yet">
            Your Tesla account is connected, but no cars were found on it yet.
          </EmptyState>
        )
      )}

      {data.kind === "ready" && data.vehicles.length > 0 && (
        <div className="space-y-24">
          {data.vehicles.map((view) => (
            <VehicleSection key={view.vehicle.id} view={view} notes={data.releaseNotes} now={now} />
          ))}
        </div>
      )}

      {data.kind === "ready" && data.lastRun && (
        <footer className="mt-24 space-y-2 text-xs text-faint">
          <p>Last checked {formatDateTime(data.lastRun.started_at)}</p>
          {failedRun?.error && data.vehicles.length > 0 && (
            <div className="text-muted-foreground">
              <RunError error={failedRun.error} />
            </div>
          )}
        </footer>
      )}
    </>
  );
}

// Records version changes the car streamed once the response is sent, so the next visit has them.
// The sync reads the clock, so it waits for a real request and stays out of the prerendered page.
async function SyncStreamVersions() {
  await io();
  if (!(await hasCurrentSession())) return null;
  after(syncStreamVersionsForAllCars);
  return null;
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
