"use client";

import { BatteryMedium, Car, type LucideIcon, Route, Zap } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { startTransition, useEffect, useOptimistic, useRef, useState, ViewTransition } from "react";
import { type HomePeriod, statsHref, urlRange, type View, viewPeriods, VIEWS, type DateRange } from "@/components/stats/periods";
import { BAR_START, nextBar } from "@/lib/tab-bar";
import { cn } from "@/lib/utils";

// The page links: Driving, Charging and Battery (the Stats pages), then Car. From sm up they sit in the
// header (HeaderLinks); on a phone they are a pill floating at the bottom (PhoneNavLinks). `current` marks the
// page's own link.
export type Section = View | "car" | "settings";

type Page = { key: View | "car"; label: string; icon: LucideIcon };

const ICONS: Record<View, LucideIcon> = { driving: Route, charging: Zap, battery: BatteryMedium };
const PAGES: Page[] = [...VIEWS.map(({ value, label }) => ({ key: value, label, icon: ICONS[value] })), { key: "car", label: "Car", icon: Car }];

type Href = (page: View | "car") => string;

// Between Stats pages the period picked carries over (Custom with its dates), read from the URL the period
// switch keeps. With none picked, or from any other page, each opens on Week, as every Stats page does.
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

// The tapped link is marked at once (optimistic), so a page that is slow to load still shows which one was
// picked; the mark settles on the page that actually commits, as TabLinks does.
// prefetch={true}: with Partial Prefetching on (next.config.ts) that is the App Shell plus the page's cached
// data for this link's URL (its period), which the shared App Shell can't hold: the pages' private data
// lives 60s, under the App Shell's 5 minutes. Only links in view prefetch, so the hidden set (the header's
// on a phone, the tab bar's from sm up) costs nothing.
function Links({ current, href }: { current?: Section; href: Href }) {
  const [shown, setShown] = useOptimistic(current);
  return PAGES.map(({ key, label }) => (
    <Link
      key={key}
      href={href(key)}
      prefetch={true}
      aria-current={shown === key ? "page" : undefined}
      onNavigate={() => startTransition(() => setShown(key))}
      className={cn("tap-target hover:text-foreground", shown === key && "text-foreground")}
    >
      {label}
    </Link>
  ));
}

// ---- On a phone: a floating pill at the bottom ----

// Four icons in a glass pill floating above the bottom edge, clear of the iPhone's home bar: Driving,
// Charging, Battery and Car, each named for screen readers. The current page's icon sits on a light chip,
// which slides across to the next page's icon as the page changes (a shared view transition).
// It slides away while the page scrolls down and comes back on the way up (lib/tab-bar.ts); it is always
// there at the top, at the very bottom, while one of its links has the keyboard, and on each new page. It
// steps aside while a text field has focus, so a phone keyboard never pushes it over what's being typed.
// Only by transform, so nothing on the page moves; the page keeps room for it below its end either way
// (--phone-nav in globals.css). Hidden from sm up, where the header has the links, so there is only one
// "Main" nav. Each page renders it after its content (PhoneNav in components/header.tsx), so the keyboard and
// screen readers reach it after the page, not between the header and the page.
export function PhoneNavLinks({ current }: { current?: Section }) {
  const href = useHref();
  const pathname = usePathname();
  const { shown, typing } = useShownOnScroll(pathname);
  const [keyboard, setKeyboard] = useState(false);
  return (
    <Pill
      current={current}
      href={href}
      hidden={typing || (!shown && !keyboard)}
      onFocus={(e) => setKeyboard((e.target as Element).matches(":focus-visible"))}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setKeyboard(false);
      }}
    />
  );
}

export function PhoneNavShell({ current }: { current?: Section }) {
  return <Pill current={current} href={SHELL_HREF} hidden={false} />;
}

function Pill({
  current,
  href,
  hidden,
  onFocus,
  onBlur,
}: {
  current?: Section;
  href: Href;
  hidden: boolean;
  onFocus?: (e: React.FocusEvent<HTMLElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLElement>) => void;
}) {
  const [shown, setShown] = useOptimistic(current);
  const index = PAGES.findIndex((p) => p.key === shown);
  return (
    <nav
      aria-label="Main"
      data-phone-nav
      data-hidden={hidden || undefined}
      onFocus={onFocus}
      onBlur={onBlur}
      className="phone-nav fixed right-[max(16px,env(safe-area-inset-right))] bottom-[calc(22px+env(safe-area-inset-bottom))] left-[max(16px,env(safe-area-inset-left))] z-30 h-[56px] rounded-[28px] border p-[5px] transition-transform duration-200 ease-out data-hidden:translate-y-[calc(100%+22px+env(safe-area-inset-bottom))] motion-reduce:transition-none sm:hidden"
    >
      {/* The chip slides to a tapped icon at once (optimistic, a CSS slide), and it is also one shared element
          ("phone-nav-chip", as the Car tabs' underline): each page draws its own pill, so when the next page
          commits React pairs the old page's chip, wherever it is mid-slide, with the new one and the browser
          carries it on to its place (.tab-indicator in globals.css) instead of it jumping. The icons are
          lifted above it meanwhile. Instant under reduced motion. */}
      <ViewTransition update="tab-labels" default="none">
        <div className="relative grid h-full grid-cols-4">
          <ViewTransition name="phone-nav-chip" share="tab-indicator" default="none">
            <span
              aria-hidden="true"
              data-pill-chip
              className={cn(
                "pointer-events-none absolute inset-y-0 left-0 w-1/4 rounded-full bg-black/6 transition-[translate,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none dark:bg-white/12",
                index < 0 && "opacity-0",
              )}
              style={{ translate: `${Math.max(index, 0) * 100}% 0` }}
            />
          </ViewTransition>
          {PAGES.map(({ key, label, icon: Icon }) => (
            <Link
              key={key}
              href={href(key)}
              prefetch={true}
              aria-label={label}
              aria-current={shown === key ? "page" : undefined}
              onNavigate={() => startTransition(() => setShown(key))}
              className={cn(
                "relative flex items-center justify-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none",
                shown === key ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <Icon className="size-[24px] transition-transform duration-150 ease-out active:scale-90 motion-reduce:transition-none" strokeWidth={shown === key ? 2.25 : 2} aria-hidden />
            </Link>
          ))}
        </div>
      </ViewTransition>
    </nav>
  );
}

const PHONE = "(width < 40rem)";

// A field the phone's keyboard opens for.
function typesText(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  return el instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit", "reset", "range", "color", "file", "image", "hidden"].includes(el.type);
}

// Whether the pill is in view as the page scrolls, and whether a text field has focus. Only on a phone
// (it is hidden from sm up), with one passive listener read once a frame and a render only when the answer
// changes. On a new page it shows, and counts from the first scroll there, so the browser putting the page
// back where it was (Back) doesn't hide it.
function useShownOnScroll(pathname: string): { shown: boolean; typing: boolean } {
  const [shown, setShown] = useState(true);
  const [typing, setTyping] = useState(false);
  const bar = useRef(BAR_START);
  useEffect(() => {
    const media = window.matchMedia(PHONE);
    let frame = 0;
    let fresh = true;
    setShown(true);
    const read = () => {
      frame = 0;
      const y = window.scrollY;
      if (fresh) {
        fresh = false;
        bar.current = { shown: true, from: y };
        return;
      }
      const next = nextBar(bar.current, y, document.documentElement.scrollHeight - window.innerHeight, window.innerHeight);
      if (next.shown !== bar.current.shown) setShown(next.shown);
      bar.current = next;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    const onFocusIn = (e: FocusEvent) => setTyping(typesText(e.target));
    const onFocusOut = (e: FocusEvent) => {
      if (!typesText(e.relatedTarget)) setTyping(false);
    };
    const listen = (on: boolean) => {
      if (on) {
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll, { passive: true });
        document.addEventListener("focusin", onFocusIn);
        document.addEventListener("focusout", onFocusOut);
      } else {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
        document.removeEventListener("focusin", onFocusIn);
        document.removeEventListener("focusout", onFocusOut);
      }
    };
    const onMedia = () => {
      listen(media.matches);
      fresh = true;
      setShown(true);
      setTyping(media.matches && typesText(document.activeElement));
    };
    if (media.matches) {
      listen(true);
      setTyping(typesText(document.activeElement));
    }
    media.addEventListener("change", onMedia);
    return () => {
      media.removeEventListener("change", onMedia);
      listen(false);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [pathname]);
  return { shown, typing };
}
