"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Re-fetches the page every minute while the tab is visible, so a running update's progress stays live.
export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 60_000);
    return () => clearInterval(id);
  }, [router]);
  return null;
}
