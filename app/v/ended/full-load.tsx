"use client";

import { useEffect } from "react";

// Reached inside the app (a page or "Show more" found the link ended), the browser still holds the owner's
// pages in memory, and Back could show one. Load this page again in full, which drops them all.
export function FullLoad() {
  useEffect(() => {
    const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const loaded = entry ? new URL(entry.name).pathname : location.pathname;
    if (loaded !== location.pathname) location.replace(location.pathname);
  }, []);
  return null;
}
