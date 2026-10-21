import Link from "next/link";
import { cacheLife, cacheTag } from "next/cache";
import { Suspense } from "react";
import { checkNow, logout } from "@/app/actions";
import { CarFront, Settings2 } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Logo } from "@/components/logo";
import { VehicleSection } from "@/components/vehicle-section";
import { CheckNowButton } from "@/components/check-now-button";
import { SignInButton } from "@/components/sign-in-button";
import { buttonVariants } from "@/components/ui/button";
import { describeRunError } from "@/lib/run-error";
import { formatDateTime } from "@/lib/format";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { type Dashboard as DashboardData, loadDashboard, OWNER_DATA_TAG } from "@/lib/server/dashboard";
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
// on every server render; redirect() throws, so a signed-out result is never cached.
async function loadOwnDashboard(): Promise<{ data: DashboardData; now: number }> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  // 60s is enough for a per-link prefetch (30s minimum); the App Shell would need 5 minutes.
  cacheLife({ stale: 60 });
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  // The clock is read here, inside the cache, because reading it while rendering blocks prerendering.
  return { data: await loadDashboard(), now: Date.now() };
}

async function Dashboard({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const { data, now } = await loadOwnDashboard();
  const flash = params.error === "check" ? "The check couldn't run. Try again in a minute." : null;
  const failedRun = data.kind === "ready" && data.lastRun?.ok === false ? data.lastRun : null;

  return (
    <>
      {flash && <p role="alert" className="mb-12 border-l-2 border-destructive pl-3 text-sm">{flash}</p>}

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
            <form action={checkNow}>
              <CheckNowButton spinner className={buttonVariants({ variant: "outline", size: "lg" })} />
            </form>
          </Notice>
        ) : (
          <EmptyState
            icon={<CarFront className="size-7 text-faint" aria-hidden="true" />}
            title="No vehicles yet"
            action={
              <form action={checkNow}>
                <CheckNowButton spinner className={buttonVariants({ variant: "outline", size: "lg" })} />
              </form>
            }
          >
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

export default function Page(props: PageProps<"/">) {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-12 sm:py-20">
      <Header />
      <h1 className="sr-only">Dashboard</h1>
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard {...props} />
      </Suspense>
    </div>
  );
}
