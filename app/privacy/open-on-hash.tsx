"use client";

import { useEffect } from "react";

// A link to /privacy#stores (or any id inside a closed fold) opens that fold and scrolls to it. Without this,
// browsers differ on whether they open a closed <details> that a link points at.
export function OpenOnHash() {
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      const target = id ? document.getElementById(id) : null;
      const fold = target?.closest("details");
      if (!target || !fold) return;
      fold.open = true;
      target.scrollIntoView();
    };
    // A click on a link to the hash already in the address bar fires no hashchange, so catch the click too.
    const onClick = (event: MouseEvent) => {
      if ((event.target as Element | null)?.closest('a[href^="#"]')) setTimeout(open);
    };
    open();
    window.addEventListener("hashchange", open);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", open);
      document.removeEventListener("click", onClick);
    };
  }, []);
  return null;
}
