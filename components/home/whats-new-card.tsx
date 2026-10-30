"use client";

import { Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { markSeen } from "@/app/whats-new/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { OFFLINE, orOffline } from "@/lib/offline";
import type { Entry } from "@/lib/whats-new";

// Home's card for the newest feature an owner hasn't seen (lib/whats-new.ts decides). The button, the link to
// the rest and the cross all mark the newest entry seen. Hidden on the tap; a failure brings it back.
export function WhatsNewCard({ entry, more }: { entry: Entry; more: number }) {
  const [hidden, setHidden] = useState(false);
  const [, start] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);
  const seen = () => {
    setHidden(true);
    start(async () => {
      const err = await orOffline(markSeen(), OFFLINE);
      setFailed(err);
      if (err) setHidden(false);
    });
  };
  if (hidden) return null;
  return (
    <section aria-label="What's new" className="space-y-2">
      <div className="flex items-start gap-3 border px-4 py-3">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-faint" aria-hidden="true" />
        <div className="flex min-w-0 flex-1 flex-col items-start gap-2.5 sm:flex-row sm:items-center sm:gap-4">
          <div className="space-y-0.5 sm:flex-1">
            <p className="text-sm font-medium">New: {entry.title}</p>
            <p className="text-sm text-muted-foreground">{entry.text}</p>
            {more > 0 && (
              <Link href="/whats-new" onClick={seen} className="inline-block text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
                {more} more on What&apos;s new
              </Link>
            )}
          </div>
          <Link href={entry.link.href} onClick={seen} className={buttonVariants({ size: "sm" })}>
            {entry.link.label}
          </Link>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={seen} aria-label="Close" title="Close" className="-mr-1.5 shrink-0 max-sm:-mt-2 sm:self-center">
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
