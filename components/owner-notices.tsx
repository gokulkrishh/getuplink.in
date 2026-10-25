import { CarFront, Settings2 } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/empty-state";
import { SignInButton } from "@/components/sign-in-button";
import { lastSyncedText } from "@/lib/last-synced";
import { describeRunError } from "@/lib/run-error";
import type { OwnerGate, PollRun } from "@/lib/server/dashboard";

// What a page that reads the car shows when it can't (see OwnerGate), and the footer under the cars.

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

// What Tesla flagged at the car's latest online check (see carNotices): nothing when it flagged nothing.
export function CarNotices({ notices }: { notices: string[] }) {
  if (notices.length === 0) return null;
  return (
    <div role="status" className="space-y-1 border px-4 py-3 text-sm">
      {notices.map((n) => (
        <p key={n}>{n}</p>
      ))}
    </div>
  );
}

// "Last synced …" (see lastSyncedText), from the same times as the car page's header: the newest of each
// car's latest check and newest streamed reading. When the last poll failed, why. `children` go first.
export function CheckedFooter({
  syncedAt,
  now,
  lastRun,
  showError,
  children,
}: {
  syncedAt: string | null;
  now: number;
  lastRun: PollRun | null;
  showError: boolean;
  children?: ReactNode;
}) {
  if (!syncedAt && !lastRun && !children) return null;
  return (
    <footer className="mt-24 space-y-2 text-xs text-faint">
      {children}
      {syncedAt && <p>{lastSyncedText(syncedAt, now)}</p>}
      {showError && lastRun?.ok === false && lastRun.error && (
        <div className="text-muted-foreground">
          <RunError error={lastRun.error} />
        </div>
      )}
    </footer>
  );
}
