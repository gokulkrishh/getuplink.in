"use client";

import { Users, X } from "lucide-react";
import { useState, useTransition } from "react";
import { dismissShareCard } from "@/app/owners/actions";
import { useShare } from "@/components/owners/share-controls";
import { Button } from "@/components/ui/button";
import { OFFLINE, orOffline } from "@/lib/offline";

// Home's one-line card asking an owner who doesn't share whether they'd like to (lib/share-nudge.ts decides
// when). Share turns sharing on through the same action as Settings; the cross is Not now, which hides it for
// at least 30 days. Hidden on the tap, so it doesn't sit there while the page refreshes.
export function ShareNudgeCard() {
  const [hidden, setHidden] = useState(false);
  const share = useShare();
  const [dismissing, start] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);
  if (hidden) return null;
  const busy = share.pending || dismissing;
  const error = failed ?? share.error;
  const notNow = () =>
    start(async () => {
      const err = await orOffline(dismissShareCard(), OFFLINE);
      setFailed(err);
      if (!err) setHidden(true);
    });
  return (
    <section aria-label="Compare with other owners" className="space-y-2">
      <div className="flex items-start gap-3 border px-4 py-3">
        <Users className="mt-0.5 size-4 shrink-0 text-faint" aria-hidden="true" />
        <div className="flex min-w-0 flex-1 flex-col items-start gap-2.5 sm:flex-row sm:items-center sm:gap-4">
          <div className="space-y-0.5 sm:flex-1">
            <p className="text-sm font-medium">Compare your car with other owners</p>
            <p className="text-sm text-muted-foreground">Only combined figures are shown, never who you are or where you drive.</p>
          </div>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => share.change(true, () => setHidden(true))}>
            {share.pending ? "Sharing…" : "Share"}
          </Button>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={notNow} disabled={busy} aria-label="Not now" title="Not now" className="-mr-1.5 shrink-0 max-sm:-mt-2 sm:self-center">
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
