"use client";

import { useEffect } from "react";
import { markSeen } from "@/app/release-notes/actions";

// Opening Release notes counts as seeing everything on it. Runs once, only when something was new, and fails
// silently: the entries are on the page either way.
export function WhatsNewMark() {
  useEffect(() => {
    markSeen().catch(() => {});
  }, []);
  return null;
}
