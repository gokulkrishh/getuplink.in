"use client";

import Link from "next/link";
import { useEffect } from "react";
import { PlainPage } from "@/components/plain-page";
import { Button, buttonVariants } from "@/components/ui/button";

// Shown when a page fails to load (a database hiccup, say). The session cookie is untouched, so
// trying again just works once the problem passes.
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PlainPage title="Couldn't load this page" intro="Try again in a moment.">
      <div className="flex flex-wrap gap-3">
        <Button type="button" size="lg" onClick={() => retry()}>
          Try again
        </Button>
        <Link href="/" className={buttonVariants({ variant: "outline", size: "lg" })}>
          Go to Uplink
        </Link>
      </div>
    </PlainPage>
  );
}
