"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { shareFigures } from "@/app/owners/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function useShare() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const change = (on: boolean, done?: () => void) =>
    start(async () => {
      const failed = await shareFigures(on);
      setError(failed);
      if (!failed) {
        done?.();
        router.refresh();
      }
    });
  return { pending, error, change };
}

// The not-sharing box's button.
export function ShareButton() {
  const { pending, error, change } = useShare();
  return (
    <div className="space-y-2">
      <Button type="button" size="lg" disabled={pending} onClick={() => change(true)}>
        {pending ? "Sharing…" : "Share my car's figures"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

// /owners' way to stop, above the figures. Stopping deletes the owner's figures at once, so it asks first.
export function StopSharing() {
  const [asking, setAsking] = useState(false);
  const { pending, error, change } = useShare();
  return (
    <div className={cn("space-y-2", asking && "basis-full")}>
      {asking ? (
        <div role="group" aria-label="Stop sharing" className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <p className="w-full">Stop sharing? Your figures are deleted and this page closes until you share again. Your car leaves the totals at 3:30 AM.</p>
          <Button type="button" variant="destructive" disabled={pending} onClick={() => change(false)}>
            {pending ? "Stopping…" : "Stop sharing"}
          </Button>
          <Button type="button" variant="outline" disabled={pending} onClick={() => setAsking(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" onClick={() => setAsking(true)}>
          Stop sharing
        </Button>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

// Settings' switch. Off deletes the shared figures at once, so it shows the new state only once that's done.
export function ShareSwitch({ on: initial }: { on: boolean }) {
  const [on, setOn] = useState(initial);
  const { pending, error, change } = useShare();
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Share with other owners"
        disabled={pending}
        onClick={() => change(!on, () => setOn(!on))}
        className={cn(
          "tap-target relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-wait disabled:opacity-60",
          on ? "border-foreground bg-foreground" : "bg-muted",
        )}
      >
        <span className={cn("inline-block size-4 rounded-full bg-background shadow-sm transition-transform duration-150", on ? "translate-x-6" : "translate-x-1")} />
      </button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
