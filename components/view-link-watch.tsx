"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LINK_ENDED_BODY, LINK_ENDED_TITLE } from "@/lib/view-links";

const EVERY_MS = 30_000;
const ENDED_PATH = "/v/ended";

// Rendered only on a guest's pages (components/header.tsx ViewerBanner). Asks /v/status whether the view link
// is still open: every 30 seconds, when the tab comes back into view or focus, on every page change and on
// Back or Forward (which can show a page the browser kept). Once the link has ended, the page is covered at
// once and the browser loads the ended page in full, which drops the viewer cookie and every page the
// browser kept in memory. When the owner turns Hide locations on or off, the page is drawn again with the
// change. A failed check (offline) leaves the page as it is until the next one.
export function ViewLinkWatch() {
  const pathname = usePathname();
  const router = useRouter();
  const [ended, setEnded] = useState(false);
  // What the link hid at the last check: when the owner changes Hide locations, the page is drawn again.
  const hid = useRef<boolean | null>(null);

  useEffect(() => {
    let stopped = false;
    const check = async () => {
      if (stopped) return;
      try {
        const res = await fetch("/v/status", { cache: "no-store", credentials: "same-origin" });
        if (!res.ok) return;
        const body = (await res.json()) as { open?: unknown; hideLocations?: unknown };
        if (typeof body.hideLocations === "boolean") {
          if (hid.current !== null && hid.current !== body.hideLocations) router.refresh();
          hid.current = body.hideLocations;
        }
        if (body.open === false && !stopped) {
          stopped = true;
          setEnded(true);
          window.location.replace(ENDED_PATH);
        }
      } catch {
        // Offline or a hiccup: try again on the next tick.
      }
    };
    void check();
    const timer = window.setInterval(check, EVERY_MS);
    const onVisible = () => document.visibilityState === "visible" && void check();
    window.addEventListener("focus", check);
    window.addEventListener("popstate", check);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
      window.removeEventListener("popstate", check);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname, router]);

  if (!ended) return null;
  return (
    <div role="alert" className="fixed inset-0 z-[100] flex items-center justify-center bg-background p-6">
      <div className="max-w-sm space-y-2 text-center">
        <h1 className="text-xl font-medium tracking-heading">{LINK_ENDED_TITLE}</h1>
        <p className="text-sm text-muted-foreground">{LINK_ENDED_BODY}</p>
      </div>
    </div>
  );
}
