"use client";

import { CircleCheck, Users, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { dismissShareCard } from "@/app/owners/actions";
import { useShare } from "@/components/owners/share-controls";
import { Button, buttonVariants } from "@/components/ui/button";
import { OFFLINE, orOffline } from "@/lib/offline";
import { PendingLabel } from "@/components/pending-label";

// Home's one-line card asking an owner who doesn't share whether they'd like to (lib/share-nudge.ts decides
// when). Share turns sharing on through the same action as Settings; the cross is Not now, which hides it for
// at least 30 days. Hidden on the tap, so it doesn't sit there while the page refreshes. After Share it says
// so for a few seconds, then goes; `show` is the server's say, and the note stays even once that turns false.
const SHARED_NOTE_MS = 10_000;

export function ShareNudgeCard({ show }: { show: boolean }) {
  const [hidden, setHidden] = useState(false);
  const [shared, setShared] = useState(false);
  const [fading, setFading] = useState(false);
  useEffect(() => {
    if (!shared) return;
    const fade = setTimeout(() => setFading(true), SHARED_NOTE_MS - 400);
    const gone = setTimeout(() => setShared(false), SHARED_NOTE_MS);
    return () => {
      clearTimeout(fade);
      clearTimeout(gone);
    };
  }, [shared]);
  const share = useShare();
  const [dismissing, start] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);
  if (shared) {
    return (
      <section
        role="status"
        aria-label="Sharing is on"
        className={`flex items-start gap-3 rounded-lg border border-positive/40 sm:items-center bg-positive/5 px-4 py-3 transition-opacity duration-300 motion-reduce:transition-none ${fading ? "opacity-0" : "opacity-100"}`}
      >
        <CircleCheck className="mt-0.5 size-4 sm:mt-0 shrink-0 text-positive" aria-hidden="true" />
        <div className="flex min-w-0 flex-1 flex-col items-start gap-2.5 sm:flex-row sm:items-center sm:gap-4">
          <p className="text-sm sm:flex-1">You&apos;re sharing. See how you compare with other owners.</p>
          <Link href="/owners" className={buttonVariants({ variant: "outline", size: "sm" })}>
            View
          </Link>
        </div>
      </section>
    );
  }
  if (!show) return null;
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
      <div className="flex items-start gap-3 rounded-lg border px-4 py-3">
        <Users className="mt-0.5 size-4 shrink-0 text-faint" aria-hidden="true" />
        <div className="flex min-w-0 flex-1 flex-col items-start gap-2.5 sm:flex-row sm:items-center sm:gap-4">
          <div className="space-y-0.5 sm:flex-1">
            <p className="text-sm font-medium">Compare your car with other owners</p>
            <p className="text-sm text-muted-foreground">Only combined figures are shown, never who you are or where you drive.</p>
          </div>
          <Button type="button" size="sm" disabled={busy} className="glow relative" onClick={() => share.change(true, () => setShared(true))}>
            <PendingLabel pending={share.pending} label="Share" pendingLabel="Sharing" />
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
