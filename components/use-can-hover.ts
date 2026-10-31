"use client";

import { useSyncExternalStore } from "react";

// Whether the pointer can hover (a mouse), so a phone's emulated hover never opens a popover and then a tap
// shuts it. The ⓘ (InfoButton) and the small tips (TipTrigger) open on hover only where this is true.
const HOVER = "(hover: hover) and (pointer: fine)";
function subscribe(change: () => void) {
  const query = window.matchMedia(HOVER);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
}
const canHover = () => window.matchMedia(HOVER).matches;

export function useCanHover(): boolean {
  return useSyncExternalStore(subscribe, canHover, () => false);
}
