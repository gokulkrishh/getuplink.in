"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// A sideways-scrolling strip that opens on its newest (right-hand) end, or with `from="start"` on its first
// (a chart of categories rather than time). It scrolls only when its content is wider than it: a chart's
// hidden tips are laid out too and would otherwise add a sliver of scroll to a chart that fits.
export function ScrollEnd({ children, label, from = "end" }: { children: ReactNode; label: string; from?: "start" | "end" }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrolls, setScrolls] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    const content = el?.firstElementChild as HTMLElement | null;
    if (!el || !content) return;
    const measure = () => setScrolls(content.offsetWidth > el.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (scrolls && ref.current && from === "end") ref.current.scrollLeft = ref.current.scrollWidth;
  }, [scrolls, from]);
  return (
    <div
      ref={ref}
      className={cn("relative", scrolls && "scroll-thin overflow-x-auto overscroll-x-contain pb-3")}
      role={scrolls ? "region" : undefined}
      aria-label={scrolls ? label : undefined}
      tabIndex={scrolls ? 0 : undefined}
    >
      {children}
    </div>
  );
}
