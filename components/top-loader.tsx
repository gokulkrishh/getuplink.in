"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// A thin bar across the top of the window while a page loads, so a click on a link, a bar or a tab shows it
// was taken. Next has no navigation events, so a click on a same-site link starts it (as nextjs-toploader
// does), and the new address arriving finishes it. Back and forward start it too. It gives up after 15
// seconds, for a link that turned out to go nowhere new.
const GIVE_UP_MS = 15_000;

export function TopLoader() {
  const path = usePathname();
  const search = useSearchParams().toString();
  const [progress, setProgress] = useState<number | null>(null);
  const timers = useRef<number[]>([]);
  const loading = useRef(false);

  const clear = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  };

  useEffect(() => {
    const start = () => {
      clear();
      loading.current = true;
      setProgress(8);
      // Creeps towards 90% and waits there for the page.
      [[150, 30], [600, 55], [1500, 72], [3000, 85], [6000, 90]].forEach(([at, to]) => timers.current.push(window.setTimeout(() => setProgress(to), at)));
      timers.current.push(
        window.setTimeout(() => {
          loading.current = false;
          setProgress(null);
        }, GIVE_UP_MS),
      );
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      // Only a new page or new days, not a link to where we already are or to a spot on this page.
      if (url.pathname === location.pathname && url.search === location.search) return;
      start();
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", start);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", start);
      clear();
    };
  }, []);

  // The new address is here: fill the bar, then let it fade.
  useEffect(() => {
    if (!loading.current) return;
    loading.current = false;
    clear();
    setProgress(100);
    timers.current.push(window.setTimeout(() => setProgress(null), 250));
  }, [path, search]);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5">
      <div
        className="h-full bg-chart-accent transition-[width,opacity] duration-300 ease-out motion-reduce:transition-none"
        style={{ width: `${progress ?? 100}%`, opacity: progress === null ? 0 : 1 }}
      />
    </div>
  );
}
