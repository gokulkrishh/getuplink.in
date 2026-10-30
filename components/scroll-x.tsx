"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { TABLE_FRAME } from "@/lib/table-frame";
import { cn } from "@/lib/utils";

// A table or list wider than the screen scrolls sideways instead of cutting its text short. While there's
// more to one side, that edge fades out, so it's clear the rows go on, and a thin scroll bar sits below the
// last row with room of its own.
// A data table in TABLE_FRAME. The border is on this outer box and the fade on the inner ScrollX, so the fade
// never eats the border.
export function TableBox({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn(TABLE_FRAME, className)}>
      <ScrollX>{children}</ScrollX>
    </div>
  );
}

export function ScrollX({ className, children }: { className?: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setEdges({ left: el.scrollLeft > 1, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 });
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, []);
  const fade = 32;
  const mask = edges.left || edges.right ? `linear-gradient(to right, ${edges.left ? "transparent" : "black"}, black ${edges.left ? fade : 0}px, black calc(100% - ${edges.right ? fade : 0}px), ${edges.right ? "transparent" : "black"})` : undefined;
  return (
    <div ref={box} className={cn("scroll-thin overflow-x-auto overflow-y-hidden overscroll-x-contain", (edges.left || edges.right) && "pb-3", className)} style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}>
      {children}
    </div>
  );
}
