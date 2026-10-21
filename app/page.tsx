import { connection } from "next/server";
import { Suspense } from "react";
import { checkNow, logout } from "@/app/actions";
import { Logo } from "@/components/logo";
import { VehicleSection } from "@/components/vehicle-section";
import { CheckNowButton } from "@/components/check-now-button";
import { buttonVariants } from "@/components/ui/button";
import { DEMO } from "@/lib/demo";
import { describeRunError } from "@/lib/run-error";
import { DEMO_SCENARIOS } from "@/lib/server/demo-data";
import { formatDateTime } from "@/lib/format";
import { loadDashboard } from "@/lib/server/dashboard";

function Header({ connected }: { connected: boolean }) {
  return (
    <header className="mb-16 flex items-center justify-between gap-4 text-sm">
      <h1 className="flex items-center gap-2.5 font-medium">
        <Logo className="size-5" />
        Uplink
      </h1>
      <nav className="flex items-baseline gap-4 text-muted-foreground">
        {connected && (
          <form action={checkNow}>
            <CheckNowButton className="hover:text-foreground disabled:text-foreground" />
          </form>
        )}
        <form action={logout}>
          <button className="hover:text-foreground">Sign out</button>
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
        <summary className="cursor-pointer text-faint hover:text-muted-foreground">Details</summary>
        <p className="mt-2 font-mono break-all text-muted-foreground">{error}</p>
      </details>
    </div>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-2xl font-medium tracking-tight">{title}</h2>
      <div className="max-w-md space-y-4 text-sm text-muted-foreground">{children}</div>
    </section>
  );
}

async function Dashboard({ searchParams }: PageProps<"/">) {
  await connection();
  const params = await searchParams;
  const demo = typeof params.demo === "string" ? params.demo : "full";
  const data = await loadDashboard(demo);
  const flash = params.error === "check" ? "The check couldn't run. Try again in a minute." : null;
  const failedRun = data.kind === "ready" && data.lastRun?.ok === false ? data.lastRun : null;

  return (
    <>
      {DEMO && <DemoBar active={demo} />}
      <Header connected={data.kind === "ready"} />
      {flash && <p className="mb-12 border-l-2 border-destructive pl-3 text-sm">{flash}</p>}

      {data.kind === "misconfigured" && (
        <Notice title="Not configured">
          <p>These environment variables are missing in Vercel:</p>
          <p className="font-mono text-foreground">{data.missing.join(", ")}</p>
        </Notice>
      )}

      {data.kind === "error" && (
        <Notice title="Something went wrong">
          <p className="font-mono">{data.message}</p>
        </Notice>
      )}

      {data.kind === "disconnected" && (
        <Notice title="Connect your Tesla">
          <p>
            Read-only access to vehicle data. The tracker checks every few hours and never wakes the car, so versions
            appear once it is seen online.
          </p>
          {/* Plain link: the OAuth flow is a full-page redirect. */}
          <a href="/api/auth/connect" className={buttonVariants({ className: "h-9 px-4" })}>
            Connect Tesla
          </a>
        </Notice>
      )}

      {data.kind === "ready" && data.vehicles.length === 0 && (
        <Notice title={failedRun ? "Couldn't reach Tesla" : "No vehicles yet"}>
          {failedRun?.error ? (
            <RunError error={failedRun.error} />
          ) : (
            <p>Your Tesla account is connected, but no vehicles were found on it yet.</p>
          )}
          <form action={checkNow}>
            <CheckNowButton className={buttonVariants({ variant: "outline", className: "h-9 px-4" })} />
          </form>
        </Notice>
      )}

      {data.kind === "ready" && data.vehicles.length > 0 && (
        <div className="space-y-24">
          {data.vehicles.map((view) => (
            <VehicleSection key={view.vehicle.id} view={view} />
          ))}
        </div>
      )}

      {data.kind === "ready" && data.lastRun && (
        <footer className="mt-24 space-y-2 text-xs text-faint">
          <p>Last check {formatDateTime(data.lastRun.started_at)}</p>
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

export default function Page(props: PageProps<"/">) {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-12 sm:py-20">
      <Suspense fallback={<p className="text-sm text-faint">Loading…</p>}>
        <Dashboard {...props} />
      </Suspense>
    </div>
  );
}
