"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

// A sideways-scrolling strip that opens on its newest (right-hand) end.
export function ScrollEnd({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollLeft = ref.current.scrollWidth;
  }, []);
  return (
    <div ref={ref} className="relative overflow-x-auto overscroll-x-contain" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}
