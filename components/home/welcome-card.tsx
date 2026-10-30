"use client";

import { Compass, X } from "lucide-react";
import { useState, useTransition } from "react";
import { closeWelcome } from "@/app/whats-new/actions";
import { Button } from "@/components/ui/button";
import { WhatsNewPlaces } from "@/components/whats-new-places";
import { OFFLINE, orOffline } from "@/lib/offline";

// Home's card for a newly approved owner (lib/whats-new.ts decides who). Got it, the cross, or tapping a
// place closes it for good. It hides on the tap, so it doesn't sit there while the page refreshes; a failure
// brings it back with the reason.
export function WelcomeCard() {
  const [hidden, setHidden] = useState(false);
  const [, start] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);
  const close = () => {
    setHidden(true);
    start(async () => {
      const err = await orOffline(closeWelcome(), OFFLINE);
      setFailed(err);
      if (err) setHidden(false);
    });
  };
  if (hidden) return null;
  return (
    <section aria-label="Welcome to Uplink" className="space-y-2">
      <div className="flex items-start gap-3 border px-4 py-3">
        <Compass className="mt-0.5 size-4 shrink-0 text-faint" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Welcome to Uplink</p>
            <p className="text-sm text-muted-foreground">This is Home: your car now and your week so far. Here&apos;s where everything else is.</p>
          </div>
          <WhatsNewPlaces onPick={close} />
          <Button type="button" size="sm" onClick={close}>
            Got it
          </Button>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={close} aria-label="Close" title="Close" className="-mr-1.5 shrink-0 max-sm:-mt-2">
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {failed}
        </p>
      )}
    </section>
  );
}
