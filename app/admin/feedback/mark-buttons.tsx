"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { FeedbackStatus } from "@/lib/server/data/system";
import { markFeedback } from "./actions";

// What can be done with a message from where it is: read it, finish it, or open it again.
const NEXT: Record<FeedbackStatus, { to: FeedbackStatus; label: string }[]> = {
  new: [
    { to: "read", label: "Mark read" },
    { to: "done", label: "Done" },
  ],
  read: [
    { to: "done", label: "Done" },
    { to: "new", label: "Mark unread" },
  ],
  done: [{ to: "read", label: "Reopen" }],
};

export function MarkButtons({ id, status }: { id: number; status: FeedbackStatus }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      {NEXT[status].map((n) => (
        <Button
          key={n.to}
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError((await markFeedback(id, n.to)).error);
            })
          }
        >
          {n.label}
        </Button>
      ))}
      {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
