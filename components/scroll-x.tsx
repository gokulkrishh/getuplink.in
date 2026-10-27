"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// A table or list wider than the screen scrolls sideways instead of cutting its text short. While there's
// more to one side, that edge fades out, so it's clear the rows go on.
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
    <div ref={box} className={cn("overflow-x-auto overflow-y-hidden overscroll-x-contain", className)} style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}>
      {children}
    </div>
  );
}
