"use client";

import { Drawer } from "@base-ui/react/drawer";
import { Pause, Play, RotateCcw, X } from "lucide-react";
import { type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { BACKDROP, POPUP, VIEWPORT } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

// The shell both Home dialogs share: the welcome tour and the release dialog. A blurred Home behind, two
// halves (a picture on the left, the words on the right), and a footer with the step dots, Skip, Back and Next.
// On a phone it is a sheet from the bottom, which a swipe down closes (components/ui/drawer.tsx). Each dialog supplies its steps. Closing is never more than one tap.
// It moves on by itself like a slider on apple.com (see Slider below) until the owner takes over.

export type TourStep = {
  key: string;
  // What sits before the label, like a tinted "New". Optional.
  chip?: ReactNode;
  // A small grey line at the top of the words: the step's name, or "Version 0.4".
  label: ReactNode;
  title: ReactNode;
  description: ReactNode;
  // Under the description: the points, or a link.
  extra?: ReactNode;
  // The left half. The same component type in the same place on every step, so a pointer can glide.
  preview: ReactNode;
};

// The left half's soft streaky backdrop: cool grey and blue-grey streaks, blurred; a darker set for dark theme.
export function TourBackdrop() {
  return (
    <>
      <div
        className="absolute -inset-8 blur-xl dark:hidden"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(255,255,255,.22) 0 5px, rgba(60,80,110,.12) 5px 13px), linear-gradient(100deg, #8ea3bb 0%, #61748c 28%, #c5cfdb 52%, #8fa0b4 76%, #aebccc 100%)",
        }}
      />
      <div
        className="absolute -inset-8 hidden blur-xl dark:block"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(255,255,255,.06) 0 5px, rgba(0,0,0,.18) 5px 13px), linear-gradient(100deg, #2b3a4d 0%, #18222f 30%, #3d4c60 55%, #202c3b 78%, #33425a 100%)",
        }}
      />
    </>
  );
}

// Where a picture sits on the backdrop: inset from the top left, running off the right and bottom edges and
// fading out at the bottom. Children are placed in a box of the picture's width.
// `focusY` (px down the phone picture): the part to keep in view on a phone, where only the top shows. The
// picture moves up until that part sits a little under halfway down the row, whose height follows the screen.
export function TourSlice({ children, focusY = 0 }: { children: ReactNode; focusY?: number }) {
  return (
    <div className="absolute inset-0 overflow-hidden [mask-image:linear-gradient(to_bottom,#000_72%,transparent_100%)]">
      <div
        className="absolute top-4 left-4 w-[340px] max-sm:translate-y-[var(--lift)] max-sm:motion-safe:transition-transform max-sm:motion-safe:duration-[600ms] sm:top-7 sm:left-7 sm:w-[480px]"
        style={{ "--lift": `calc(-1 * max(0px, ${focusY}px - min(110px, 9dvh)))` } as CSSProperties}
      >
        {children}
      </div>
    </div>
  );
}

// How long each step shows before the tour moves on by itself: time to read a headline, a line and three points.
const STEP_MS = 8000;

// "playing": moving on by itself. "paused": held by the play button, the fill kept where it was. "stopped": the
// owner moved by hand or reached a button with the keyboard. "ended": it played to the last step. Nobody who
// prefers reduced motion gets it moving on by itself.
type Play = "playing" | "paused" | "stopped" | "ended";

// The step dots and the play button, as on apple.com: the dots sit close in a soft capsule, the step showing
// stretches into a pill, and while the tour plays a fill runs through that pill for the step's time. The fill
// is a CSS animation whose end moves the tour on, so there is no timer to keep. Paused holds the fill where it
// is, and Play carries on from there. Stopped or ended, the pill is full. Each dot's tap area is the capsule's full height; the
// marks are in px, so the phone's larger text doesn't widen them.
function Slider({ steps, step, play, onPick, onPlay, onDone, className }: { steps: TourStep[]; step: number; play: Play; onPick: (n: number) => void; onPlay: () => void; onDone: () => void; className?: string }) {
  if (steps.length < 2) return null;
  const Icon = play === "playing" ? Pause : play === "ended" ? RotateCcw : Play;
  const running = play === "playing" || play === "paused";
  return (
    <div data-tour-slider className={cn("flex items-center gap-2", className)}>
      <div className="flex h-[36px] items-center rounded-full bg-foreground/[0.07] px-[8px] backdrop-blur-sm">
        {steps.map((s, i) => (
          <button
            key={s.key}
            type="button"
            aria-label={`Go to step ${i + 1} of ${steps.length}`}
            aria-current={i === step ? "step" : undefined}
            onClick={() => onPick(i)}
            className="group/dot flex h-full cursor-pointer items-center px-[4px] outline-none"
          >
            <span
              className={cn(
                "relative block h-[8px] overflow-hidden rounded-full transition-[width,background-color] duration-300 ease-out motion-reduce:transition-none group-focus-visible/dot:outline-2 group-focus-visible/dot:outline-offset-2 group-focus-visible/dot:outline-ring",
                i === step ? "w-[32px] bg-foreground/25" : "w-[8px] bg-foreground/30 group-hover/dot:bg-foreground/55",
              )}
            >
              {i === step && (
                <span
                  key={`${s.key}-${running}`}
                  onAnimationEnd={onDone}
                  style={{ animationDuration: `${STEP_MS}ms`, animationPlayState: play === "paused" ? "paused" : undefined }}
                  className={cn("absolute inset-y-0 left-0 w-full rounded-full bg-foreground", running && "animate-tour-fill")}
                />
              )}
            </span>
          </button>
        ))}
      </div>
      <button
        type="button"
        aria-label={play === "playing" ? "Pause" : play === "ended" ? "Play again" : "Play"}
        onClick={onPlay}
        className="inline-flex size-[36px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-foreground/[0.07] text-foreground backdrop-blur-sm transition-colors outline-none hover:bg-foreground/[0.12] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:bg-foreground/[0.15]"
      >
        <Icon className={cn("size-[14px]", (play === "paused" || play === "stopped") && "fill-current")} aria-hidden="true" />
      </button>
    </div>
  );
}

// A step's words. The title and description are the dialog's own only for the step showing (`real`).
function Words({ step, real }: { step: TourStep; real: boolean }) {
  const Title = real ? Drawer.Title : "h2";
  const Description = real ? Drawer.Description : "p";
  return (
    <>
      <Title className="max-w-[16ch] text-xl leading-tight font-semibold tracking-heading text-balance sm:max-w-[20ch] sm:text-[1.75rem]">{step.title}</Title>
      <Description className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-[15px]">{step.description}</Description>
      {step.extra}
    </>
  );
}

// Tab and Shift+Tab go round the dialog's own buttons. Base UI traps focus too, but a frame late, so a fast
// Tab could reach the page behind.
function wrapTab(e: KeyboardEvent<HTMLDivElement>) {
  if (e.key !== "Tab") return;
  const all = [...e.currentTarget.querySelectorAll<HTMLElement>("button, a[href], [tabindex]:not([tabindex='-1'])")].filter(
    (el) => !el.hasAttribute("disabled") && !el.closest("[aria-hidden='true']") && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden",
  );
  if (all.length === 0) return;
  const first = all[0];
  const last = all[all.length - 1];
  const at = document.activeElement;
  if (e.shiftKey ? at === first || at === e.currentTarget : at === last) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  }
}

// The step state lives here, inside the popup, so it starts again at step 1 each time the dialog opens.
// On a phone the sheet is never taller than the screen: the picture row shrinks on a short screen, the
// words hold the height of the longest step (so nothing moves between steps) and scroll if they must, and
// the footer stays at the bottom.
function Popup({ steps }: { steps: TourStep[] }) {
  const [n, setN] = useState(0);
  // Which way the last move went, so the words slide in from that side.
  const [dir, setDir] = useState<1 | -1>(1);
  // Plays from the start of each open (the popup mounts on open), unless reduced motion is on.
  const [play, setPlay] = useState<Play>(() =>
    steps.length > 1 && !matchMedia("(prefers-reduced-motion: reduce)").matches ? "playing" : "stopped",
  );
  const popup = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const step = steps[n];
  const last = n === steps.length - 1;
  const show = (to: number) => {
    const next = Math.max(0, Math.min(steps.length - 1, to));
    setDir(next < n ? -1 : 1);
    setN(next);
  };
  // A move by hand (Next, Back, a dot, a swipe, an arrow key) means the owner is reading at their own pace.
  // At either end it moves nothing, so it changes nothing ("Play again" stays).
  const go = (to: number) => {
    if (Math.max(0, Math.min(steps.length - 1, to)) === n) return;
    setPlay("stopped");
    show(to);
  };
  const onDone = () => {
    if (play !== "playing") return;
    if (last) setPlay("ended");
    else show(n + 1);
  };
  const onPlay = () => {
    if (play === "playing") return setPlay("paused");
    if (play === "ended") show(0);
    setPlay("playing");
  };
  // A swipe across the picture on a touch screen: 40px sideways, and more sideways than down.
  const onSwipeStart = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") swipe.current = { x: e.clientX, y: e.clientY };
  };
  const onSwipeEnd = (e: PointerEvent) => {
    const from = swipe.current;
    swipe.current = null;
    if (!from) return;
    const dx = e.clientX - from.x;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(e.clientY - from.y)) go(n + (dx < 0 ? 1 : -1));
  };
  return (
    <Drawer.Popup
      ref={popup}
      initialFocus={popup}
      // Reaching Skip, Back or Next with the keyboard stops it: moving on to the last step would swap them
      // for "Got it" and take the focus with them. The dots and play button stay put, so they don't.
      onFocus={(e) => {
        const at = e.target;
        if (play === "playing" && at !== e.currentTarget && at.matches(":focus-visible") && !at.closest("[data-tour-slider]")) setPlay("stopped");
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(n + 1);
        else if (e.key === "ArrowLeft") go(n - 1);
        else wrapTab(e);
      }}
      className={cn(POPUP, "text-base sm:h-[min(690px,calc(100dvh-2rem))] sm:w-[min(980px,calc(100vw-2rem))] sm:max-h-none sm:pb-0")}
    >
      {/* Content lays out nothing (display: contents); it lets a mouse select the words without swiping. */}
      <Drawer.Content className="contents">
        <div className="flex min-h-0 flex-1 flex-col sm:grid sm:grid-cols-2 sm:grid-rows-1">
          {/* A swipe surface: the browser keeps up-and-down scrolling, sideways is the tour's (touch-action: pan-y). */}
          <div
            // Sideways drags here are the tour's; a drag down still closes the sheet.
            data-base-ui-swipe-ignore="x"
            onPointerDown={onSwipeStart}
            onPointerUp={onSwipeEnd}
            onPointerCancel={() => (swipe.current = null)}
            className="relative h-[min(230px,30dvh)] shrink-0 touch-pan-y border-b [@media(max-height:640px)]:h-[26dvh] sm:h-auto sm:min-h-0 sm:border-r sm:border-b-0">
            <div className="relative h-full min-h-0 overflow-hidden">{step.preview}</div>
          </div>
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col p-5 max-sm:[@media(max-height:640px)]:py-4 sm:p-8">
            {/* On a phone the dots sit at the right of this line, so the footer is one row and the sheet fits a small screen. */}
            <div className="flex shrink-0 items-center gap-2.5 text-sm text-faint max-sm:-mt-2.5 max-sm:min-h-[40px] sm:pr-9">
              {step.chip}
              <span className="min-w-0 flex-1 truncate">{step.label}</span>
              <Slider steps={steps} step={n} play={play} onPick={go} onPlay={onPlay} onDone={onDone} className="sm:hidden" />
            </div>
            {/* On a phone every step's words sit in one cell, the others unseen, so the cell is as tall as the longest. */}
            <div className="grid min-h-0 flex-1 overflow-y-auto overscroll-y-contain pt-4 sm:flex sm:flex-col sm:justify-center sm:overflow-visible sm:pt-0">
              <div
                key={step.key}
                className={cn(
                  "col-start-1 row-start-1 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300 motion-safe:ease-out",
                  dir === 1 ? "motion-safe:slide-in-from-right-3" : "motion-safe:slide-in-from-left-3",
                )}
              >
                <Words step={step} real />
              </div>
              {steps.map((s, i) =>
                i === n ? null : (
                  <div key={s.key} aria-hidden="true" className="invisible col-start-1 row-start-1 sm:hidden">
                    <Words step={s} real={false} />
                  </div>
                ),
              )}
            </div>
            <div className="flex shrink-0 items-center justify-between gap-2 pt-4">
              <Slider steps={steps} step={n} play={play} onPick={go} onPlay={onPlay} onDone={onDone} className="max-sm:hidden" />
              <div className="flex flex-1 items-center justify-between gap-1.5 sm:flex-none sm:justify-end">
                {/* On a phone Skip is quiet text at the left and the buttons are a size smaller, so all fit at 320px. */}
                {!last ? (
                  <Drawer.Close render={<Button variant="ghost" className="max-sm:-ml-3 max-sm:h-9 max-sm:px-3 max-sm:text-muted-foreground" />} nativeButton>
                    Skip
                  </Drawer.Close>
                ) : (
                  <span aria-hidden="true" />
                )}
                <div className="flex items-center gap-1.5">
                  {n > 0 && (
                    <Button variant="outline" className="max-sm:h-9 max-sm:px-3" onClick={() => go(n - 1)}>
                      Back
                    </Button>
                  )}
                  {last ? (
                    <Drawer.Close render={<Button className="max-sm:h-9 max-sm:px-3" />} nativeButton>
                      Got it
                    </Drawer.Close>
                  ) : (
                    <Button className="max-sm:h-9 max-sm:px-3" onClick={() => go(n + 1)}>
                      Next
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Drawer.Content>
      {/* A 44px tap area. On a phone it sits at the sheet's top right, over the picture, on its own disc. */}
      <Drawer.Close
        aria-label="Close"
        className="group absolute top-1 right-1 z-20 inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground sm:top-2.5 sm:right-2.5"
      >
        <span className="inline-flex size-8 items-center justify-center rounded-full transition-colors sm:group-hover:bg-muted group-focus-visible:outline-2 group-focus-visible:outline-ring max-sm:bg-background/85 max-sm:text-foreground max-sm:shadow-sm max-sm:backdrop-blur-sm">
          <X className="size-4" aria-hidden="true" />
        </span>
      </Drawer.Close>
    </Drawer.Popup>
  );
}

// Open on its own unless `open` is given. `onOpenChange` hears every change, so a caller can store that the
// dialog was closed.
export function TourDialog({ steps, open, onOpenChange }: { steps: TourStep[]; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [own, setOwn] = useState(false);
  const controlled = open !== undefined;
  // Opens once the page under it has finished loading. Opening while the week is still streaming in makes
  // React see attributes the dialog set on the page's own elements, and warn of a hydration mismatch.
  // A dialog the caller opens (`open` given) needs no wait.
  useEffect(() => {
    if (controlled) return;
    let tries = 0;
    let delay: ReturnType<typeof setTimeout> | undefined;
    const timer = setInterval(() => {
      tries += 1;
      if (document.readyState === "complete" && (!document.querySelector('[aria-busy="true"]') || tries > 40)) {
        clearInterval(timer);
        delay = setTimeout(() => setOwn(true), 300);
      }
    }, 150);
    return () => {
      clearInterval(timer);
      clearTimeout(delay);
    };
  }, [controlled]);
  return (
    <Drawer.Root
      open={controlled ? open : own}
      // Tapping the backdrop does nothing: the cross, Skip, "Got it" and Esc close it.
      disablePointerDismissal
      onOpenChange={(next) => {
        setOwn(next);
        onOpenChange?.(next);
      }}
    >
      <Drawer.Portal>
        {/* Lighter than other dialogs: the tour's steps point at the page behind it. */}
        <Drawer.Backdrop className={cn(BACKDROP, "bg-black/30")} />
        <Drawer.Viewport className={VIEWPORT}>
          <Popup steps={steps} />
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
