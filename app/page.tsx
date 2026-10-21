import { connection } from "next/server";
import { Suspense } from "react";
import { checkNow, logout } from "@/app/actions";
import { Logo } from "@/components/logo";
import { VehicleSection } from "@/components/vehicle-section";
import { Button, buttonVariants } from "@/components/ui/button";
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
            <button className="hover:text-foreground">Check now</button>
          </form>
        )}
        <form action={logout}>
          <button className="hover:text-foreground">Sign out</button>
        </form>
      </nav>
    </header>
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
  const [data, params] = await Promise.all([loadDashboard(), searchParams]);
  const flash = typeof params.error === "string" ? params.error : null;

  return (
    <>
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
        <Notice title="No vehicles yet">
          <p>The account is connected, but no check has found a vehicle so far.</p>
          <form action={checkNow}>
            <Button type="submit" variant="outline" className="h-9 px-4">
              Check now
            </Button>
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
        <footer className="mt-24 text-xs text-faint">
          Last check {formatDateTime(data.lastRun.started_at)}
          {data.lastRun.ok === false && <span className="block text-muted-foreground">{data.lastRun.error}</span>}
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
