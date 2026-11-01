"use client";

import { Eye } from "lucide-react";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VIEW_BAR_COOKIE, VIEW_BAR_REOPEN_MS } from "@/lib/view-links";

// Kept for this browser session only. A blocked cookie just means the pill opens again on the next page.
// The <html data-guest> mark follows, as the page's first script would set it (GUEST_SCRIPT).
function remember(hidden: boolean) {
  try {
    document.cookie = hidden ? `${VIEW_BAR_COOKIE}=hidden; Path=/; SameSite=Lax` : `${VIEW_BAR_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  } catch {
    // Cookies off: the choice holds on this page only.
  }
  document.documentElement.dataset.guest = hidden ? "folded" : "open";
}

// Both float at the bottom, clear of the phone's home bar and, on a phone, above the tab bar (--above-bar). The page keeps room for them below its last
// content (globals.css, html[data-guest] body), so nothing is ever hidden behind them, and as they float
// nothing moves when they stream in. Above the page, below dialogs and menus (z-50).
const BOTTOM = "bottom-(--above-bar)";

// The guest pill: floating at the bottom centre of every page. One line at every width, down to 320px:
// "You're using guest mode", then Hide (a quiet word) and Exit (a small outlined pill).
// Hidden, it folds into a small button in the bottom-right corner that opens it again. The server draws it
// in the state the cookie says (viewBarOpen), and it opens itself again in the link's last 5 minutes. No
// animation, so nothing moves for reduced motion.
export function ViewerBar({ open: initial, expiresAt }: { open: boolean; expiresAt: string }) {
  const [open, setOpen] = useState(initial);

  useEffect(() => {
    if (open) return;
    const left = Date.parse(expiresAt) - Date.now() - VIEW_BAR_REOPEN_MS;
    const timer = window.setTimeout(() => {
      remember(false);
      setOpen(true);
    }, Math.max(0, left));
    return () => window.clearTimeout(timer);
  }, [open, expiresAt]);

  const show = (next: boolean) => {
    remember(!next);
    setOpen(next);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => show(true)}
        className={cn(
          "fixed right-[max(1rem,env(safe-area-inset-right))] z-40 inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-muted bg-background px-3.5 text-sm text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none",
          BOTTOM,
        )}
      >
        <Eye className="size-4 text-chart-accent" aria-hidden />
        Guest view
      </button>
    );
  }

  return (
    <section
      data-guest-pill
      aria-label="Guest view"
      className={cn(
        "fixed left-1/2 z-40 flex h-10 max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-1 rounded-full border border-muted bg-popover py-1 pr-1 pl-4 text-sm whitespace-nowrap text-popover-foreground shadow-md max-sm:text-xs max-[360px]:max-w-[calc(100vw-1rem)] max-[360px]:gap-0.5 max-[360px]:pl-3",
        BOTTOM,
      )}
    >
      <p className="min-w-0 truncate font-medium">You&apos;re using guest mode</p>
      <button
        type="button"
        onClick={() => show(false)}
        className="tap-target h-8 shrink-0 cursor-pointer rounded-full px-2.5 text-muted-foreground max-[360px]:px-2 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
      >
        Hide
      </button>
      {/* A plain link, never a client-side one: leaving loads the next page in full, so nothing the
          browser kept of the owner's car stays in memory. */}
      <a href="/v/leave" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 shrink-0 rounded-full px-3 max-sm:h-8 max-sm:px-3 max-sm:text-xs max-[360px]:px-2.5")}>
        Exit
      </a>
    </section>
  );
}
