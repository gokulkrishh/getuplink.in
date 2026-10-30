"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PlainPage } from "@/components/plain-page";
import { Button } from "@/components/ui/button";
import { OFFLINE } from "@/lib/offline";
import { OPEN_INTRO, OPEN_TITLE } from "./words";

// Shown when Uplink answered but couldn't open the link (a database hiccup, say). OFFLINE is only for a
// request that never got an answer.
const FAILED = "Uplink couldn't open this link. Try again.";

// Claims the link once (/v/seen), then loads Home, or the ended page, in full. It draws nothing meanwhile.
// Offline or a hiccup, it shows the page with what happened and offers to try again: the pending cookie stays until a claim is answered.
export function Claim() {
  const [failed, setFailed] = useState<string | null>(null);
  const started = useRef(false);

  const claim = useCallback(async () => {
    setFailed(null);
    let res: Response;
    try {
      res = await fetch("/v/seen", { method: "POST", cache: "no-store", credentials: "same-origin" });
    } catch {
      setFailed(OFFLINE);
      return;
    }
    try {
      if (!res.ok) throw new Error(String(res.status));
      const { opened } = (await res.json()) as { opened?: unknown };
      window.location.replace(opened === true ? "/" : "/v/ended");
    } catch {
      setFailed(FAILED);
    }
  }, []);

  useEffect(() => {
    // Once per page, even when React runs effects twice in development.
    if (started.current) return;
    started.current = true;
    void claim();
  }, [claim]);

  if (!failed) return null;
  return (
    <PlainPage home="/home" title={OPEN_TITLE} intro={OPEN_INTRO}>
      <div className="space-y-3">
        <p role="alert" className="text-sm text-destructive">
          {failed}
        </p>
        <Button type="button" variant="outline" size="lg" onClick={() => void claim()}>
          Try again
        </Button>
      </div>
    </PlainPage>
  );
}
