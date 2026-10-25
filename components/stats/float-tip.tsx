"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/utils";

// A chart tooltip above the hovered or tapped mark (`anchor`), in the chart tooltips' style. It sits in the
// mark's positioned container and is clamped inside it, so it never runs off a phone screen. With
// `interactive` it takes the pointer (for a link inside it); its bottom padding bridges the gap to the mark
// so moving onto it doesn't count as leaving.
export function FloatTip({ anchor, interactive = false, children }: { anchor: HTMLElement; interactive?: boolean; children: ReactNode }) {
  const tip = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = tip.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return;
    const a = anchor.getBoundingClientRect();
    const p = parent.getBoundingClientRect();
    const center = a.left - p.left + a.width / 2;
    const left = Math.max(0, Math.min(parent.clientWidth - el.offsetWidth, center - el.offsetWidth / 2));
    const top = a.top - p.top;
    setPos((prev) => (prev && prev.left === left && prev.top === top ? prev : { left, top }));
  });
  return (
    <div
      ref={tip}
      className={cn("absolute z-10 -translate-y-full pb-1.5", interactive ? "pointer-events-auto" : "pointer-events-none")}
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }}
      aria-live="polite"
    >
      <div className="border bg-background px-2 py-1 text-xs whitespace-nowrap tabular-nums shadow-sm">{children}</div>
    </div>
  );
}

// The mark whose tip is open, and a way to set it. A tap outside `within` closes it, since touch has no
// pointer leaving; pass the element that holds the marks and the tip.
export function useActiveMark<K>(within: RefObject<HTMLElement | null>) {
  const [active, setActive] = useState<{ key: K; el: HTMLElement } | null>(null);
  useEffect(() => {
    if (!active) return;
    const away = (e: PointerEvent) => {
      if (!within.current?.contains(e.target as Node)) setActive(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [active, within]);
  return [active, setActive] as const;
}
