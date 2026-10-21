"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

// Shown when a page fails to load (a database hiccup, say). The session cookie is untouched, so
// trying again just works once the problem passes.
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-start justify-center gap-3 px-4">
      <h1 className="text-base font-medium tracking-[-0.01em]">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">Uplink couldn&apos;t load this page. Try again in a moment.</p>
      <Button type="button" variant="outline" className="mt-1 h-9 px-4" onClick={() => retry()}>
        Try again
      </Button>
    </main>
  );
}
