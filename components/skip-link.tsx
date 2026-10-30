"use client";

import type { MouseEvent } from "react";

// The page's main area holds the header too, so a plain jump to it lands back on the logo and nav: the page
// scrolls to the top and nothing is skipped. On a page with the app header the link goes to the marker at
// the header's bottom edge (#content-start in components/header.tsx, components/plain-page.tsx and the home
// page), so the next Tab is the page's first control. A page with no header goes to the main area, as the
// href does with no script.
function skip(e: MouseEvent<HTMLAnchorElement>) {
  const target = document.getElementById("content-start") ?? document.getElementById("content");
  if (!target) return;
  e.preventDefault();
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: "start" });
}

export function SkipLink() {
  return (
    <a
      href="#content"
      onClick={skip}
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-background focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:text-foreground"
    >
      Skip to content
    </a>
  );
}
