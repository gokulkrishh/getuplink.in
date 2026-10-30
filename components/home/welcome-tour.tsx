"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Bell, LogOut, MessageSquare, Settings, Sparkles, X } from "lucide-react";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { closeWelcome } from "@/app/releases/actions";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { OFFLINE, orOffline } from "@/lib/offline";
import { cn } from "@/lib/utils";

// The welcome for a newly approved owner (lib/whats-new.ts decides who): a short tour in a dialog over Home.
// On the left a drawing of the app, with a pointer that glides to the part the step is about. On the right the
// words. Skip, the cross, Esc, tapping outside and "Got it" all close it, and any of them counts as seen.
// Closing is never more than one tap, and nothing is trapped behind a step.

type View = "home" | "stats" | "updates" | "compare" | "menu";
type Spot = "tiles" | "stats" | "car" | "updates" | "compare" | "avatar";

type Step = { name: string; view: View; spot: Spot; lit: Spot[]; title: string; lead: ReactNode; points: [string, string, string] };

// A feature's name inside a sentence: stands out, but isn't a link.
function Term({ children }: { children: ReactNode }) {
  return <span className="text-foreground underline decoration-muted-foreground/60 decoration-dotted underline-offset-4">{children}</span>;
}

const STEPS: Step[] = [
  {
    name: "Home",
    view: "home",
    spot: "tiles",
    lit: ["tiles"],
    title: "Your car at a glance",
    lead: (
      <>
        <Term>Home</Term> shows your car now and your last 7 days.
      </>
    ),
    points: ["Distance driven", "Charging spend", "Battery level"],
  },
  {
    name: "Stats",
    view: "stats",
    spot: "stats",
    lit: ["stats"],
    title: "Every drive and charge",
    lead: (
      <>
        <Term>Stats</Term> is in the top bar.
      </>
    ),
    points: ["Every drive you take", "What each charge cost", "How your battery is holding up"],
  },
  {
    name: "Updates",
    view: "updates",
    spot: "updates",
    lit: ["car", "updates"],
    title: "Know when your update comes",
    lead: (
      <>
        <Term>Updates</Term> is under <Term>Car</Term>.
      </>
    ),
    points: ["Every version your car got", "Tesla's notes for each one", "How each update is reaching cars in India"],
  },
  {
    name: "Compare",
    view: "compare",
    spot: "compare",
    lit: ["car", "compare"],
    title: "See how you compare",
    lead: (
      <>
        <Term>Compare</Term> is under <Term>Car</Term>.
      </>
    ),
    points: ["Your car next to other owners'", "Only combined figures are shown", "Never who you are or where you drive"],
  },
  {
    name: "Settings",
    view: "menu",
    spot: "avatar",
    lit: ["avatar"],
    title: "Settings and what's new",
    lead: "Your photo opens the menu.",
    points: ["Settings, for theme and sharing", "What's new, when Uplink adds something", "Feedback, straight to the person who builds Uplink"],
  },
];

const LIT = "outline-2 outline-offset-2 outline-chart-accent";

// A slice of the real screen, drawn at the app's own sizes (14px). Decorative: the words say all of it.
function Screen({ step }: { step: Step }) {
  const lit = (s: Spot) => (step.lit.includes(s) ? LIT : "");
  const tab = (label: string, picked: boolean, spot?: Spot) => (
    <span key={label} data-spot={spot} className={cn("px-3 py-1.5 text-sm", picked ? "bg-foreground text-background" : "text-muted-foreground", spot && lit(spot))}>
      {label}
    </span>
  );
  const tabs = (labels: string[], picked: string, spots: Record<string, Spot> = {}) => (
    <div className="inline-flex w-fit border">{labels.map((l) => tab(l, l === picked, spots[l]))}</div>
  );
  const tiles = (
    <div data-spot="tiles" className={cn("grid grid-cols-3 gap-3", lit("tiles"))}>
      {[
        ["Driven", "214 km"],
        ["Charging", "₹412.80"],
        ["Battery", "72%"],
      ].map(([k, v]) => (
        <div key={k} className="border bg-background p-3">
          <p className="text-xs text-muted-foreground">{k}</p>
          <p className="mt-1 text-lg font-medium tabular-nums">{v}</p>
        </div>
      ))}
    </div>
  );
  return (
    <div className="relative min-h-[820px] w-[480px] border-t border-l bg-background text-sm text-foreground shadow-xl">
      <div className="flex h-12 w-[420px] items-center justify-between px-5">
        <span className="flex items-center gap-2 font-medium">
          <Logo className="size-5" />
          Uplink
        </span>
        <span className="flex items-center gap-5 text-muted-foreground">
          <span data-spot="stats" className={cn("px-1", lit("stats"), step.view === "stats" && "text-foreground")}>
            Stats
          </span>
          <span data-spot="car" className={cn("px-1", lit("car"), (step.view === "updates" || step.view === "compare") && "text-foreground")}>
            Car
          </span>
          <Bell className="size-4" aria-hidden="true" />
          <span data-spot="avatar" className={cn("size-6 rounded-full bg-gradient-to-br from-chart-accent to-charge", lit("avatar"))} />
        </span>
      </div>
      <div key={step.view} className="space-y-4 px-5 pt-6 pb-8 motion-safe:animate-[tour-in_0.35s_ease-out]">
        {(step.view === "home" || step.view === "menu") && (
          <>
            <div className="space-y-1">
              <p className="text-xl font-medium tracking-heading">Good morning</p>
              <p className="text-muted-foreground">Here&apos;s your car&apos;s last 7 days.</p>
            </div>
            {tiles}
            <svg viewBox="0 0 400 80" className="h-20 w-[420px] text-chart-accent" aria-hidden="true">
              <polyline fill="none" stroke="currentColor" strokeWidth="2" points="0,50 40,34 80,56 120,24 170,40 220,64 270,20 320,36 400,28" />
            </svg>
            <div className="space-y-1 pt-4">
              <p className="text-lg font-medium tracking-heading">Charge level</p>
              <p className="text-muted-foreground">Battery level over time, with charging marked.</p>
            </div>
            <svg viewBox="0 0 400 120" className="h-32 w-[420px] text-charge" aria-hidden="true">
              <polyline fill="none" stroke="currentColor" strokeWidth="2" points="0,90 60,80 90,30 150,26 200,60 260,70 300,22 400,18" />
            </svg>
          </>
        )}
        {step.view === "stats" && (
          <>
            <p className="text-2xl font-medium tracking-heading">Stats</p>
            {tabs(["Driving", "Charging", "Battery"], "Driving")}
            <div className="flex h-32 w-[420px] items-end gap-3 border-b">
              {[40, 65, 30, 85, 55, 20, 70].map((h, i) => (
                <i key={i} className="flex-1 bg-chart-accent/80" style={{ height: `${h}%` }} />
              ))}
            </div>
            <p className="text-muted-foreground">214 km in 7 days</p>
            <div className="w-[420px] divide-y border-y">
              {[
                ["Home to Indiranagar", "12.4 km"],
                ["Indiranagar to office", "8.1 km"],
                ["Office to Whitefield", "21.7 km"],
                ["Whitefield to home", "19.3 km"],
              ].map(([r, k]) => (
                <p key={r} className="flex justify-between py-2.5">
                  <span>{r}</span>
                  <span className="text-muted-foreground tabular-nums">{k}</span>
                </p>
              ))}
            </div>
          </>
        )}
        {step.view === "updates" && (
          <>
            <p className="text-2xl font-medium tracking-heading">Car</p>
            {tabs(["My Car", "Updates", "Compare"], "Updates", { Updates: "updates" })}
            <div className="w-[420px] divide-y border-y font-mono text-[13px]">
              {[
                ["2026.38.5.1", "14 Oct"],
                ["2026.32.7", "2 Sept"],
                ["2026.26.3", "11 Jul"],
                ["2026.20.9", "4 May"],
                ["2026.14.6", "9 Mar"],
                ["2026.8.3", "18 Jan"],
                ["2025.44.25", "2 Dec"],
              ].map(([v, d]) => (
                <p key={v} className="flex justify-between py-2.5">
                  <span>{v}</span>
                  <span className="text-muted-foreground">{d}</span>
                </p>
              ))}
            </div>
          </>
        )}
        {step.view === "compare" && (
          <>
            <p className="text-2xl font-medium tracking-heading">Car</p>
            {tabs(["My Car", "Updates", "Compare"], "Compare", { Compare: "compare" })}
            <div className="w-[420px] space-y-3 pt-1">
              {[
                ["You", "72%", "bg-chart-you", "142 Wh/km"],
                ["Owners", "84%", "bg-muted-foreground/50", "156 Wh/km"],
                ["You", "58%", "bg-chart-you", "9.8 kWh"],
                ["Owners", "66%", "bg-muted-foreground/50", "11.2 kWh"],
                ["You", "81%", "bg-chart-you", "412 km"],
                ["Owners", "74%", "bg-muted-foreground/50", "380 km"],
              ].map(([who, w, c, n], i) => (
                <div key={i} className="grid grid-cols-[3.5rem_1fr_5.5rem] items-center gap-3">
                  <span>{who}</span>
                  <span className="h-3 bg-muted">
                    <i className={cn("block h-full", c)} style={{ width: w }} />
                  </span>
                  <span className="text-right text-muted-foreground tabular-nums">{n}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      {step.view === "menu" && (
        <div className="absolute top-[3.25rem] right-[3.5rem] w-44 border bg-popover p-1 text-popover-foreground shadow-lg">
          {[
            [Settings, "Settings"],
            [Sparkles, "What's new"],
            [MessageSquare, "Feedback"],
            [LogOut, "Sign out"],
          ].map(([Icon, label]) => {
            const I = Icon as typeof Settings;
            return (
              <p key={label as string} className="flex items-center gap-2.5 px-2.5 py-2">
                <I className="size-4 text-muted-foreground" aria-hidden="true" />
                {label as string}
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}

// The left half: a soft streaky backdrop, the screen slice on it (running off the right and bottom edges,
// fading out at the bottom), and the pointer.
function Preview({ step }: { step: Step }) {
  const box = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState({ x: 150, y: 170 });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const place = () => {
      const target = el.querySelector<HTMLElement>(`[data-spot="${step.spot}"]`);
      if (!target) return;
      const a = el.getBoundingClientRect();
      const b = target.getBoundingClientRect();
      setAt({ x: b.left - a.left + Math.min(b.width * 0.6, 44), y: b.top - a.top + b.height * 0.6 });
    };
    place();
    const watch = new ResizeObserver(place);
    watch.observe(el);
    return () => watch.disconnect();
  }, [step]);
  return (
    <div ref={box} aria-hidden="true" className="relative h-full min-h-0 overflow-hidden">
      {/* Cool grey and blue-grey streaks, blurred; a darker set for the dark theme. */}
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
      <div className="absolute inset-0 overflow-hidden [mask-image:linear-gradient(to_bottom,#000_72%,transparent_100%)]">
        <div className="absolute top-4 left-4 origin-top-left scale-[0.72] sm:top-[60px] sm:left-[60px] sm:scale-100">
          <Screen step={step} />
        </div>
      </div>
      <svg
        viewBox="0 0 16 16"
        className="absolute top-0 left-0 z-10 size-7 -translate-x-0.5 -translate-y-0.5 drop-shadow-md motion-safe:transition-transform motion-safe:duration-[600ms] motion-safe:ease-[cubic-bezier(.2,.7,.2,1)]"
        style={{ transform: `translate(${at.x}px, ${at.y}px)` }}
      >
        <path d="M2 1l11 7-5 1 3 5-2 1-3-5-4 3z" className="fill-foreground stroke-background" strokeWidth="1" />
      </svg>
    </div>
  );
}

function Dots({ step, onPick }: { step: number; onPick: (n: number) => void }) {
  return (
    <div className="flex items-center">
      {STEPS.map((s, i) => (
        <button
          key={s.name}
          type="button"
          aria-label={`Step ${i + 1} of ${STEPS.length}`}
          aria-current={i === step ? "step" : undefined}
          onClick={() => onPick(i)}
          className="group flex h-8 cursor-pointer items-center px-1 outline-none"
        >
          <span
            className={cn(
              "block h-1.5 rounded-full transition-[width,background-color] duration-200 motion-reduce:transition-none group-focus-visible:ring-2 group-focus-visible:ring-ring/50",
              i === step ? "w-5 bg-foreground" : "w-1.5 bg-foreground/20 group-hover:bg-foreground/40",
            )}
          />
        </button>
      ))}
    </div>
  );
}

// The step state lives here, inside the popup, so it starts again at step 1 each time the dialog opens.
function Popup() {
  const [n, setN] = useState(0);
  const popup = useRef<HTMLDivElement>(null);
  const step = STEPS[n];
  const last = n === STEPS.length - 1;
  const go = (to: number) => setN(Math.max(0, Math.min(STEPS.length - 1, to)));
  return (
    <Dialog.Popup
      ref={popup}
      initialFocus={popup}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(n + 1);
        else if (e.key === "ArrowLeft") go(n - 1);
      }}
      className="fixed inset-x-0 bottom-0 z-50 grid max-h-dvh grid-rows-[230px_auto] overflow-y-auto border bg-background pb-[env(safe-area-inset-bottom)] text-foreground shadow-2xl outline-none motion-safe:transition-opacity motion-safe:duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:h-[min(690px,calc(100dvh-2rem))] sm:w-[min(980px,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:grid-cols-2 sm:grid-rows-1 sm:overflow-hidden sm:pb-0"
    >
      <div className="relative min-h-0 border-b sm:border-r sm:border-b-0">
        <Preview step={step} />
      </div>
      <div className="relative flex min-h-0 min-w-0 flex-col p-5 sm:p-8">
        <div className="flex items-center gap-2.5 pr-9 text-sm text-faint max-sm:pr-0">
          <span className="bg-chart-accent/15 px-2 py-0.5 text-xs font-medium text-chart-accent">Welcome</span>
          {step.name}
        </div>
        <div className="min-h-[14rem] flex-1 pt-4 sm:flex sm:min-h-0 sm:flex-col sm:justify-center sm:pt-0">
          <Dialog.Title className="max-w-[16ch] text-xl leading-tight font-semibold tracking-heading text-balance sm:max-w-[20ch] sm:text-[1.75rem]">{step.title}</Dialog.Title>
          <Dialog.Description className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-[15px]">{step.lead}</Dialog.Description>
          <ul className="mt-5 space-y-2.5">
            {step.points.map((point) => (
              <li key={point} className="flex items-start gap-3 text-[15px] leading-snug text-foreground">
                <span aria-hidden="true" className="mt-[0.5em] size-1.5 shrink-0 bg-foreground/60" />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex items-center justify-between gap-2 pt-4">
          <Dots step={n} onPick={go} />
          <div className="flex items-center gap-1.5">
            {!last && (
              <Dialog.Close render={<Button variant="ghost" />} nativeButton>
                Skip
              </Dialog.Close>
            )}
            {n > 0 && (
              <Button variant="outline" onClick={() => go(n - 1)}>
                Back
              </Button>
            )}
            {last ? (
              <Dialog.Close render={<Button />} nativeButton>
                Got it
              </Dialog.Close>
            ) : (
              <Button onClick={() => go(n + 1)}>
                Next
              </Button>
            )}
          </div>
        </div>
        <Dialog.Close
          aria-label="Close"
          className="absolute top-3 right-3 z-20 inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring max-sm:bg-background/80 max-sm:backdrop-blur-sm sm:top-4 sm:right-4"
        >
          <X className="size-4" aria-hidden="true" />
        </Dialog.Close>
      </div>
    </Dialog.Popup>
  );
}

// `persist`: Home's own (closing writes "welcomed" to the account, fire and forget). Settings replays it with
// persist off, so that closing writes nothing. Open on its own unless `open` is given.
export function WelcomeTour({ open, onOpenChange, persist }: { open?: boolean; onOpenChange?: (open: boolean) => void; persist: boolean }) {
  const [own, setOwn] = useState(false);
  // Opens once the page under it has finished loading. Opening while the week is still streaming in makes
  // React see attributes the dialog set on the page's own elements, and warn of a hydration mismatch.
  useEffect(() => {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (document.readyState === "complete" && (!document.querySelector('[aria-busy="true"]') || tries > 40)) {
        clearInterval(timer);
        setTimeout(() => setOwn(true), 300);
      }
    }, 150);
    return () => clearInterval(timer);
  }, []);
  const [, start] = useTransition();
  const shown = open ?? own;
  return (
    <Dialog.Root
      open={shown}
      onOpenChange={(next) => {
        setOwn(next);
        onOpenChange?.(next);
        if (!next && persist) start(async () => void (await orOffline(closeWelcome(), OFFLINE)));
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/30 backdrop-blur-xs motion-safe:transition-opacity motion-safe:duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Popup />
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Settings > General: "Show" replays the tour right there. Writes nothing.
export function WelcomeTourButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Show
      </Button>
      <WelcomeTour open={open} onOpenChange={setOpen} persist={false} />
    </>
  );
}
