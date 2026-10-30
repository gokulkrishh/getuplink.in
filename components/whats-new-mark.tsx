"use client";

import { useEffect } from "react";
import { markSeen } from "@/app/whats-new/actions";

// Opening What's new counts as seeing everything on it. Runs once, only when something was new, and fails
// silently: the entries are on the page either way.
export function WhatsNewMark() {
  useEffect(() => {
    markSeen().catch(() => {});
  }, []);
  return null;
}
