"use client";

import Image from "next/image";
import { type ReactNode, useEffect, useState, useTransition } from "react";
import { closeWelcome } from "@/app/release-notes/actions";
import { TourBackdrop, TourDialog, TourSlice, type TourStep } from "@/components/home/tour-dialog";
import { Button } from "@/components/ui/button";
import { guestTourSeen, guestTourSeenCookie } from "@/lib/guest-tour";
import { OFFLINE, orOffline } from "@/lib/offline";
import { TOUR_SHOT, TOUR_TARGETS, type TourSpot } from "@/lib/tour-targets";
import { cn } from "@/lib/utils";

// The welcome for every owner, once, until they close it (lib/whats-new.ts decides): a short tour in a dialog over Home.
// On the left a screenshot of the real page, with a pointer that glides to the part the step is about. On the right the
// words. Skip, the cross, Esc and "Got it" all close it, and any of them counts as seen.
// Closing is never more than one tap, and nothing is trapped behind a step.

// `page`: the step is about a whole page (Stats, Updates, Compare), so the picture stays sharp everywhere and
// only the outline and pointer show where it is. Otherwise only the outlined part is sharp.
type Step = { name: string; spot: TourSpot; page?: boolean; title: string; lead: ReactNode; points: [string, string, string] };

// A feature's name inside a sentence: stands out, but isn't a link.
function Term({ children }: { children: ReactNode }) {
  return <span className="text-foreground underline decoration-muted-foreground/60 decoration-dotted underline-offset-4">{children}</span>;
}

const STEPS: Step[] = [
  {
    name: "Home",
    spot: "home",
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
    spot: "stats",
    page: true,
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
    spot: "updates",
    page: true,
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
    spot: "compare",
    page: true,
    title: "See how you compare",
    lead: (
      <>
        <Term>Compare</Term> is under <Term>Car</Term>.
      </>
    ),
    points: ["How your car compares with others", "Only combined figures are shown", "Never who you are or where you drive"],
  },
  {
    name: "Settings",
    spot: "menu",
    title: "Settings and release notes",
    lead: "The coloured circle at the top right, beside the bell, opens the menu.",
    points: ["Settings, for the app's look and sharing with other owners", "Release notes, for what's new in Uplink", "Sign out, when you're done"],
  },
];

const SPOTS = Object.keys(TOUR_TARGETS) as TourSpot[];
// The picture is 480px wide on a desktop and 340px on a phone (TourSlice); its height follows.
const PHONE_HEIGHT = 340 * (TOUR_SHOT.height / TOUR_SHOT.width);

// Room round the sharp part, inside the outline.
const PAD = 4;

// The pictures stacked: the current one shows, the others are clear, so a change cross-fades. Only the
// current step's and its neighbours' are mounted (`near`), so a slow connection fetches two or three, not all
// ten, and the one fading out is still there.
function Pictures({ spot, near }: { spot: TourSpot; near: TourSpot[] }) {
  return SPOTS.filter((s) => s === spot || near.includes(s)).map((s) => (
    <span key={s} className={cn("absolute inset-0 motion-safe:transition-opacity motion-safe:duration-300", s === spot ? "opacity-100" : "opacity-0")}>
      <Image src={`/whats-new/tour/${s}-light.webp`} alt="" fill sizes="480px" className="object-cover dark:hidden" />
      <Image src={`/whats-new/tour/${s}-dark.webp`} alt="" fill sizes="480px" className="hidden object-cover dark:block" />
    </span>
  ));
}

// The left half: the real page for the step, in the app's own theme, with an outline round the part the step
// is about and a pointer that glides to it. On a step about one part, only that part is sharp and the rest is
// blurred and dimmed; on a step about a whole page, all of it is sharp. Decorative: the words say all of it.
function Preview({ spot, near, page = false }: { spot: TourSpot; near: TourSpot[]; page?: boolean }) {
  const t = TOUR_TARGETS[spot];
  // On a phone only the top of the picture shows: keep the pointer in view.
  const focusY = (t.at.y / 100) * PHONE_HEIGHT;
  return (
    <div aria-hidden="true" className="relative h-full min-h-0 overflow-hidden">
      <TourBackdrop />
      <TourSlice focusY={focusY}>
        <div className="relative overflow-hidden rounded-lg border bg-background shadow-xl" style={{ aspectRatio: `${TOUR_SHOT.width} / ${TOUR_SHOT.height}` }}>
          {/* The whole page, blurred and dimmed, and the same page again on top, sharp, showing only the part the step is about. */}
          <div className="absolute inset-0 opacity-45 blur-[3px]">
            <Pictures spot={spot} near={near} />
          </div>
          <div
            className="absolute inset-0 motion-safe:transition-[clip-path] motion-safe:duration-[600ms] motion-safe:ease-[cubic-bezier(.2,.7,.2,1)]"
            style={{ clipPath: page ? "inset(0px 0px 0px 0px)" : `inset(calc(${t.y}% - ${PAD}px) calc(${100 - t.x - t.w}% - ${PAD}px) calc(${100 - t.y - t.h}% - ${PAD}px) calc(${t.x}% - ${PAD}px))` }}
          >
            <Pictures spot={spot} near={near} />
          </div>
          <span
            className="absolute rounded-md outline-2 outline-offset-2 outline-chart-accent motion-safe:transition-[left,top,width,height] motion-safe:duration-[600ms] motion-safe:ease-[cubic-bezier(.2,.7,.2,1)]"
            style={{ left: `${t.x}%`, top: `${t.y}%`, width: `${t.w}%`, height: `${t.h}%` }}
          />
          <svg
            viewBox="0 0 16 16"
            className="absolute z-10 size-7 -translate-x-0.5 -translate-y-0.5 drop-shadow-md motion-safe:transition-[left,top] motion-safe:duration-[600ms] motion-safe:ease-[cubic-bezier(.2,.7,.2,1)]"
            style={{ left: `${t.at.x}%`, top: `${t.at.y}%` }}
          >
            <path d="M2 1l11 7-5 1 3 5-2 1-3-5-4 3z" className="fill-foreground stroke-background" strokeWidth="1" />
          </svg>
        </div>
      </TourSlice>
    </div>
  );
}

const toSteps = (steps: Step[]): TourStep[] =>
  steps.map((s, i) => ({
  key: s.name,
  label: s.name,
  title: s.title,
  description: s.lead,
  extra: (
    <ul className="mt-5 space-y-2.5 max-sm:[@media(max-height:640px)]:mt-3.5 max-sm:[@media(max-height:640px)]:space-y-1.5">
      {s.points.map((point) => (
        <li key={point} className="flex items-start gap-3 text-[15px] leading-snug text-foreground">
          <span aria-hidden="true" className="mt-[0.5em] size-1.5 shrink-0 rounded-full bg-foreground/60" />
          {point}
        </li>
      ))}
    </ul>
  ),
  preview: <Preview spot={s.spot} page={s.page} near={[steps[i - 1]?.spot, steps[i + 1]?.spot].filter((x) => x !== undefined)} />,
}));

const TOUR_STEPS = toSteps(STEPS);

// Someone viewing a shared car: their own first step, then the owner tour's Home, Stats, Updates and Compare.
const GUEST_STEPS = toSteps([
  {
    name: "Guest mode",
    spot: "home",
    title: "You're seeing a shared car",
    lead: "Someone shared their car with you.",
    points: ["You can look but not change anything", "No Tesla account needed", "Exit at the bottom of the page leaves guest mode"],
  },
  ...STEPS.slice(0, 4),
]);

// `persist`: Home's own (closing writes "welcomed" to the account, fire and forget). The "Take the tour" button on
// Release notes replays it with persist off, so that closing writes nothing. Open on its own unless `open` is given.
export function WelcomeTour({ open, onOpenChange, persist }: { open?: boolean; onOpenChange?: (open: boolean) => void; persist: boolean }) {
  const [, start] = useTransition();
  return (
    <TourDialog
      steps={TOUR_STEPS}
      open={open}
      onOpenChange={(next) => {
        onOpenChange?.(next);
        if (!next && persist) start(async () => void (await orOffline(closeWelcome(), OFFLINE)));
      }}
    />
  );
}

// Release notes' "Take the tour" button: replays the tour right there. Writes nothing.
export function WelcomeTourButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* The same small size on a phone as on a desktop; its tap area is still 44px (tap-target). */}
      <Button variant="outline" size="sm" className="max-sm:h-7 max-sm:px-2.5" onClick={() => setOpen(true)}>
        Take the tour
      </Button>
      <WelcomeTour open={open} onOpenChange={setOpen} persist={false} />
    </>
  );
}

// The tour for a guest (view-links' Home renders it when the reader is a viewer). Opens once per browser: the
// cookie is read after load, so the server and the first paint agree, and any close sets it.
export function GuestTour() {
  const [seen, setSeen] = useState<boolean | null>(null);
  useEffect(() => setSeen(guestTourSeen(document.cookie)), []);
  if (seen !== false) return null;
  return <TourDialog steps={GUEST_STEPS} onOpenChange={(next) => !next && (document.cookie = guestTourSeenCookie(location.protocol === "https:"))} />;
}
