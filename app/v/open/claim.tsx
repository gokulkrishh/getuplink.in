"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { OFFLINE } from "@/lib/offline";

// Claims the link once (/v/seen), then loads Home, or the ended page, in full. Offline or a hiccup, it says so
// and offers to try again: the pending cookie stays until a claim is answered.
export function Claim() {
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  const claim = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch("/v/seen", { method: "POST", cache: "no-store", credentials: "same-origin" });
      if (!res.ok) throw new Error(String(res.status));
      const { opened } = (await res.json()) as { opened?: unknown };
      window.location.replace(opened === true ? "/" : "/v/ended");
    } catch {
      setFailed(true);
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
    <div className="space-y-3">
      <p role="alert" className="text-sm text-destructive">
        {OFFLINE}
      </p>
      <Button type="button" variant="outline" size="lg" onClick={() => void claim()}>
        Try again
      </Button>
    </div>
  );
}
