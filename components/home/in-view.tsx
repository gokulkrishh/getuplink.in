"use client";

import { type RefObject, useEffect, useRef, useState } from "react";

// True once the element is half in view, and straight away when the owner asked for reduced motion
// (`reduced` tells the picture to show its end state without moving). Plays once.
export function useInView<T extends HTMLElement>(): { ref: RefObject<T | null>; seen: boolean; reduced: boolean } {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReduced(true);
      setSeen(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          setSeen(true);
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, seen, reduced };
}
