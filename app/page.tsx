import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { checkNow, logout } from "@/app/actions";
import { Settings2 } from "lucide-react";
import { CybercabGlyph } from "@/components/cybercab-glyph";
import { EmptyState } from "@/components/empty-state";
import { Logo } from "@/components/logo";
import { VehicleSection } from "@/components/vehicle-section";
import { CheckNowButton } from "@/components/check-now-button";
import { SignInButton } from "@/components/sign-in-button";
import { buttonVariants } from "@/components/ui/button";
import { DEMO } from "@/lib/demo";
import { describeRunError } from "@/lib/run-error";
import { DEMO_SCENARIOS } from "@/lib/server/demo-data";
import { formatDateTime } from "@/lib/format";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { loadDashboard } from "@/lib/server/dashboard";
import { redirect } from "next/navigation";

function Header() {
  return (
    <header className="mb-16 flex items-center justify-between gap-4 text-sm">
      <h1 className="font-medium">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo className="size-5" />
          Uplink
        </Link>
      </h1>
      <nav className="flex items-baseline gap-4 text-muted-foreground">
        <Link href="/stats" className="hover:text-foreground">
          Stats
        </Link>
        <Link href="/settings" className="hover:text-foreground">
          Settings
        </Link>
        <form action={logout}>
          <button className="cursor-pointer hover:text-foreground">Sign out</button>
        </form>
      </nav>
    </header>
  );
}

function DemoBar({ active }: { active: string }) {
  return (
    <nav className="mb-12 flex flex-wrap gap-x-4 gap-y-1 border-y py-3 text-xs text-muted-foreground">
      <span className="text-faint">Demo</span>
      {Object.entries(DEMO_SCENARIOS).map(([key, label]) => (
        <a key={key} href={`/?demo=${key}`} className={key === active ? "text-foreground" : "hover:text-foreground"}>
          {label}
        </a>
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
      <h2 className="text-base font-medium tracking-[-0.01em]">{title}</h2>
      <div className="max-w-md space-y-4 text-sm text-muted-foreground">{children}</div>
    </section>
  );
}

async function Dashboard({ searchParams }: PageProps<"/">) {
  await connection();
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  const params = await searchParams;
  const demo = typeof params.demo === "string" ? params.demo : "full";
  const data = await loadDashboard(demo);
  const flash = params.error === "check" ? "The check couldn't run. Try again in a minute." : null;
  const failedRun = data.kind === "ready" && data.lastRun?.ok === false ? data.lastRun : null;

  return (
    <>
      {DEMO && <DemoBar active={demo} />}
      <Header />
      {flash && <p className="mb-12 border-l-2 border-destructive pl-3 text-sm">{flash}</p>}

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
            Uplink needs read-only access to your vehicle data. It checks every few hours and never wakes the car, so a
            version appears once the car is seen online.
          </p>
          <SignInButton />
        </Notice>
      )}

      {data.kind === "ready" && data.vehicles.length === 0 && (
        failedRun?.error ? (
          <Notice title="Couldn't reach Tesla">
            <RunError error={failedRun.error} />
            <form action={checkNow}>
              <CheckNowButton spinner className={buttonVariants({ variant: "outline", className: "h-9 px-4" })} />
            </form>
          </Notice>
        ) : (
          <EmptyState
            icon={<CybercabGlyph className="mb-1 h-8 w-[4.5rem] text-faint" />}
            title="No vehicles yet"
            action={
              <form action={checkNow}>
                <CheckNowButton spinner className={buttonVariants({ variant: "outline", className: "h-9 px-4" })} />
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
            <VehicleSection key={view.vehicle.id} view={view} notes={data.releaseNotes} />
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

// Shown while the dashboard loads: the real header plus faint blocks in the shape of a vehicle section.
function DashboardSkeleton() {
  const block = "bg-muted motion-safe:animate-pulse";
  return (
    <div aria-busy="true" aria-label="Loading dashboard">
      <header className="mb-16 flex items-center justify-between gap-4 text-sm">
        <span className="flex items-center gap-2.5 font-medium">
          <Logo className="size-5" />
          Uplink
        </span>
      </header>
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
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard {...props} />
      </Suspense>
    </div>
  );
}
