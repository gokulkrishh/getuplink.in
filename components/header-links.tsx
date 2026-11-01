"use client";

import { BatteryMedium, Car, type LucideIcon, Route, Zap } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { type HomePeriod, statsHref, urlRange, type View, viewPeriods, VIEWS, type DateRange } from "@/components/stats/periods";
import { BAR_START, nextBar } from "@/lib/tab-bar";
import { cn } from "@/lib/utils";

// The page links: Driving, Charging and Battery (the Stats pages), then Car. From sm up they sit in the
// header (HeaderLinks); on a phone they are a tab bar fixed to the bottom (TabBar). `current` marks the
// page's own link.
export type Section = View | "car" | "settings";

type Page = { key: View | "car"; label: string; icon: LucideIcon };

const ICONS: Record<View, LucideIcon> = { driving: Route, charging: Zap, battery: BatteryMedium };
const PAGES: Page[] = [...VIEWS.map(({ value, label }) => ({ key: value, label, icon: ICONS[value] })), { key: "car", label: "Car", icon: Car }];

type Href = (page: View | "car") => string;

// Between Stats pages the period picked carries over (Custom with its dates), read from the URL the period
// switch keeps. With none picked, or from any other page, each opens on its own: Week on Driving, Month on
// Charging, All on Battery.
function useHref(): Href {
  const pathname = usePathname();
  const params = useSearchParams();
  const view = VIEWS.find((v) => pathname === `/stats/${v.value}`)?.value ?? null;
  const raw = view ? params.get("period") : null;
  const range = raw === "custom" ? urlRange(params.get("from"), params.get("to")) : null;
  const period: HomePeriod | null = range ? "custom" : view ? (viewPeriods(view).options.find((p) => p === raw) ?? null) : null;
  return hrefs(period, range);
}

// The links before the URL is read: each page on its own period. The same size, so nothing moves.
const SHELL_HREF = hrefs(null, null);

function hrefs(period: HomePeriod | null, range: DateRange | null): Href {
  return (page) => (page === "car" ? "/car" : statsHref(page, period ?? viewPeriods(page).opensOn, range));
}

// ---- From sm up: in the header ----

export function HeaderLinks({ current }: { current?: Section }) {
  return <Links current={current} href={useHref()} />;
}

export function HeaderLinksShell({ current }: { current?: Section }) {
  return <Links current={current} href={SHELL_HREF} />;
}

function Links({ current, href }: { current?: Section; href: Href }) {
  return PAGES.map(({ key, label }) => (
    <Link
      key={key}
      href={href(key)}
      prefetch={true}
      aria-current={current === key ? "page" : undefined}
      className={cn("tap-target hover:text-foreground", current === key && "text-foreground")}
    >
      {label}
    </Link>
  ));
}

// ---- On a phone: the tab bar ----

// Four equal tabs, an icon over each name, fixed to the bottom and clear of the iPhone's home bar. It slides
// away while the page scrolls down and comes back on the way up (lib/tab-bar.ts), and is always there at the
// top, at the very bottom, while one of its tabs has the keyboard, and on each new page. Only by transform,
// so nothing on the page moves; the page keeps room for it below its end either way (--tab-bar in
// globals.css). Hidden from sm up, where the header has the links, so there is only one "Main" nav.
export function TabBar({ current }: { current?: Section }) {
  const href = useHref();
  const pathname = usePathname();
  const shown = useShownOnScroll(pathname);
  const [focused, setFocused] = useState(false);
  return (
    <Bar
      current={current}
      href={href}
      hidden={!shown && !focused}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
    />
  );
}

export function TabBarShell({ current }: { current?: Section }) {
  return <Bar current={current} href={SHELL_HREF} hidden={false} />;
}

function Bar({
  current,
  href,
  hidden,
  onFocus,
  onBlur,
}: {
  current?: Section;
  href: Href;
  hidden: boolean;
  onFocus?: () => void;
  onBlur?: (e: React.FocusEvent<HTMLElement>) => void;
}) {
  return (
    <nav
      aria-label="Main"
      data-tab-bar
      data-hidden={hidden || undefined}
      onFocus={onFocus}
      onBlur={onBlur}
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t bg-background pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] transition-transform duration-200 ease-out data-hidden:translate-y-full motion-reduce:transition-none sm:hidden"
    >
      {PAGES.map(({ key, label, icon: Icon }) => (
        <Link
          key={key}
          href={href(key)}
          prefetch={true}
          aria-current={current === key ? "page" : undefined}
          className={cn(
            "flex h-11 flex-col items-center justify-center gap-0.5 text-[0.6875rem] leading-none",
            current === key ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <Icon className="size-5" strokeWidth={current === key ? 2.25 : 1.75} aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  );
}

// Whether the bar is in view as the page scrolls. One passive listener, read once a frame, and a render only
// when the answer changes. Back in view on a new page.
function useShownOnScroll(pathname: string): boolean {
  const [shown, setShown] = useState(true);
  const bar = useRef(BAR_START);
  useEffect(() => {
    bar.current = { shown: true, from: window.scrollY };
    setShown(true);
    let frame = 0;
    const read = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const next = nextBar(bar.current, window.scrollY, max);
      if (next.shown !== bar.current.shown) setShown(next.shown);
      bar.current = next;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [pathname]);
  return shown;
}
