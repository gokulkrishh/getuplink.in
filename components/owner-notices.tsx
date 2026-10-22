import { CarFront, Settings2 } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/empty-state";
import { SignInButton } from "@/components/sign-in-button";
import { formatDateTime } from "@/lib/format";
import { describeRunError } from "@/lib/run-error";
import type { OwnerGate, PollRun } from "@/lib/server/dashboard";

// What a page that reads the car shows when it can't (see OwnerGate), and the footer under the cars.

export function RunError({ error }: { error: string }) {
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

// Not configured, couldn't load, not connected, or connected with no cars. `count` is the cars there are
// once ready; nothing renders while there is at least one.
export function OwnerNotices({ data, count, failedRun }: { data: OwnerGate | { kind: "ready" }; count: number; failedRun: PollRun | null }) {
  return (
    <>
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
        <Notice title="Couldn't load your car">
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

      {data.kind === "ready" && count === 0 && (
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
    </>
  );
}

// "Last checked …" and, when the last poll failed, why. `children` go first, like a link to Settings.
export function CheckedFooter({ lastRun, showError, children }: { lastRun: PollRun | null; showError: boolean; children?: ReactNode }) {
  if (!lastRun && !children) return null;
  return (
    <footer className="mt-24 space-y-2 text-xs text-faint">
      {children}
      {lastRun && <p>Last checked {formatDateTime(lastRun.started_at)}</p>}
      {showError && lastRun?.ok === false && lastRun.error && (
        <div className="text-muted-foreground">
          <RunError error={lastRun.error} />
        </div>
      )}
    </footer>
  );
}
