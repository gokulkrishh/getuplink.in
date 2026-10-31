"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { shareFigures } from "@/app/owners/actions";
import { Button } from "@/components/ui/button";
import { OFFLINE, orOffline } from "@/lib/offline";
import { cn } from "@/lib/utils";
import { PendingLabel } from "@/components/pending-label";
import { Switch } from "@/components/ui/switch";

export function useShare() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const change = (on: boolean, done?: () => void) =>
    start(async () => {
      const failed = await orOffline(shareFigures(on), OFFLINE);
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
      <Button type="button" size="lg" disabled={pending} className="relative" onClick={() => change(true)}>
        <PendingLabel pending={pending} label="Share my car's figures" pendingLabel="Sharing" />
      </Button>
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
      {/* The label is the 44px tap area; the switch is shadcn's. */}
      <label className={cn("inline-flex min-h-11 cursor-pointer items-center gap-3", pending && "cursor-wait opacity-60")}>
        <span className="w-6 text-right text-sm">{on ? "On" : "Off"}</span>
        <Switch checked={on} disabled={pending} onCheckedChange={(next) => change(next, () => setOn(next))} aria-label="Share with other owners" />
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
