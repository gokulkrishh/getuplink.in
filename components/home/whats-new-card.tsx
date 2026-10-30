"use client";

import { Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { markSeen } from "@/app/whats-new/actions";
import { Button } from "@/components/ui/button";
import { OFFLINE, orOffline } from "@/lib/offline";
import type { Entry } from "@/lib/whats-new";

// Home's card for the newest feature an owner hasn't seen (lib/whats-new.ts decides). The link to the page
// and the cross both mark the newest entry seen. Hidden on the tap; a failure brings it back.
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
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm font-medium">New: {entry.title}</p>
          <p className="text-sm text-muted-foreground">{entry.text}</p>
          <Link href="/whats-new" onClick={seen} className="inline-block pt-1.5 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
            {more > 0 ? `See all ${more + 1} on What's new` : "See what's new"}
          </Link>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={seen} aria-label="Close" title="Close" className="-mt-1.5 -mr-1.5 shrink-0">
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
