"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { OFFLINE, orOffline } from "@/lib/offline";
import { checkAgain } from "./actions";
import { PendingLabel } from "@/components/pending-label";

// Asks Tesla again; the page refreshes with the answer. `checkedAt` is the page's "last checked" time: when a
// check leaves it where it was (asked too soon after the last one, or Tesla didn't answer), a line says so,
// so a press is never met with nothing.
export function CheckAgain({ checkedAt }: { checkedAt?: string | null }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // The time before the last press, once it has finished.
  const [pressedAt, setPressedAt] = useState<string | null | undefined>(undefined);
  const [ran, setRan] = useState(false);
  const run = () => {
    const before = checkedAt;
    start(async () => {
      const failed = await orOffline(checkAgain().then(() => null), OFFLINE);
      setError(failed);
      setPressedAt(before);
      setRan(!failed);
    });
  };
  // Without the time there's no telling, so nothing is said.
  const unchanged = checkedAt !== undefined && ran && !pending && pressedAt === checkedAt;
  return (
    <>
      <Button type="button" variant="outline" size="lg" className="relative" disabled={pending} aria-busy={pending} onClick={run}>
        <PendingLabel pending={pending} label="Check again" pendingLabel="Checking" />
      </Button>
      <p role="status" className={error ? "text-sm text-destructive" : "text-xs text-muted-foreground empty:hidden"}>
        {error ?? (unchanged ? "No change yet. Try again in a few minutes." : "")}
      </p>
    </>
  );
}
