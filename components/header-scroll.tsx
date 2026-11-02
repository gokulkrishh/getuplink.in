"use client";

import { useEffect } from "react";

// Marks <html> with data-scrolled once the page has moved, so a sticky header (the sticky-bar utility in
// globals.css) shows its hairline. One passive listener, read once a frame, writing only when the answer
// changes. Renders nothing.
export function HeaderScroll() {
  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;
    const read = () => {
      frame = 0;
      const scrolled = window.scrollY > 0;
      if (scrolled !== root.hasAttribute("data-scrolled")) root.toggleAttribute("data-scrolled", scrolled);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
      root.removeAttribute("data-scrolled");
    };
  }, []);
  return null;
}
