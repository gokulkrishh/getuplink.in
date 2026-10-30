import { CarFront, Settings2 } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/empty-state";
import { SignInButton } from "@/components/sign-in-button";
import { lastSyncedText } from "@/lib/last-synced";
import { describeRunError } from "@/lib/run-error";
import type { OwnerGate, PollRun } from "@/lib/server/dashboard";

// What a page that reads the car shows when it can't (see OwnerGate), and the footer under the cars.

// Only the plain sentence: the raw Tesla error stays in the logs and the poll runs, never on screen.
function RunError({ error }: { error: string }) {
  return <p>{describeRunError(error)}</p>;
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
// once ready; nothing renders while there is at least one. `viewer`: someone the owner sent a view link,
// who gets no sign-in button or setup words, only what's the matter.
export function OwnerNotices({ data, count, failedRun, viewer = false }: { data: OwnerGate | { kind: "ready" }; count: number; failedRun: PollRun | null; viewer?: boolean }) {
  return (
    <>
      {data.kind === "misconfigured" && !viewer && (
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
          <p>Reload the page, or try again in a moment.</p>
        </Notice>
      )}

      {data.kind === "misconfigured" && viewer && (
        <Notice title="Couldn't load this car">
          <p>Try again in a while.</p>
        </Notice>
      )}

      {data.kind === "disconnected" && viewer && (
        <Notice title="Couldn't load this car">
          <p>Its owner&apos;s Tesla account isn&apos;t connected to Uplink right now.</p>
        </Notice>
      )}

      {data.kind === "disconnected" && !viewer && (
        <Notice title="Connect your Tesla account">
          <p>
            Uplink needs read-only access. It never wakes the car, so a version shows once the car is awake.
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
          <EmptyState icon={<CarFront className="size-7 text-faint" aria-hidden="true" />} title="No cars yet">
            {viewer ? "No cars found on the owner's Tesla account yet." : "No cars found on your Tesla account yet."}
          </EmptyState>
        )
      )}
    </>
  );
}

// Home's week couldn't be read while the car above it did: name what's missing, not the car.
export function WeekNotice() {
  return (
    <Notice title="Couldn't load this week's figures">
      <p>Reload the page, or try again in a moment.</p>
    </Notice>
  );
}

// What Tesla flagged at the car's latest online check (see carNotices): nothing when it flagged nothing.
export function CarNotices({ notices }: { notices: string[] }) {
  if (notices.length === 0) return null;
  return (
    <div role="status" className="space-y-1 rounded-lg border px-4 py-3 text-sm">
      {notices.map((n) => (
        <p key={n}>{n}</p>
      ))}
    </div>
  );
}

// "Last synced …" (see lastSyncedText), from the same times as the car page's header: the newest of each
// car's latest check and newest streamed reading. `children` go first. A failed last check isn't repeated
// here: the header's alerts bell lists it.
export function CheckedFooter({ syncedAt, now, children }: { syncedAt: string | null; now: number; children?: ReactNode }) {
  if (!syncedAt && !children) return null;
  return (
    <footer className="mt-24 space-y-2 text-xs text-faint">
      {children}
      {syncedAt && <p>{lastSyncedText(syncedAt, now)}</p>}
    </footer>
  );
}
