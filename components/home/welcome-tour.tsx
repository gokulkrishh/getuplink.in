"use client";

import Image from "next/image";
import { type ReactNode, useEffect, useState, useTransition } from "react";
import { closeWelcome } from "@/app/whats-new/actions";
import { TourBackdrop, TourDialog, TourSlice, type TourStep } from "@/components/home/tour-dialog";
import { Button } from "@/components/ui/button";
import { guestTourSeen, guestTourSeenCookie } from "@/lib/guest-tour";
import { OFFLINE, orOffline } from "@/lib/offline";
import { TOUR_SHOT, TOUR_TARGETS, type TourSpot } from "@/lib/tour-targets";
import { cn } from "@/lib/utils";

// The welcome for a newly approved owner (lib/whats-new.ts decides who): a short tour in a dialog over Home.
// On the left a screenshot of the real page, with a pointer that glides to the part the step is about. On the right the
// words. Skip, the cross, Esc, tapping outside and "Got it" all close it, and any of them counts as seen.
// Closing is never more than one tap, and nothing is trapped behind a step.

type Step = { name: string; spot: TourSpot; title: string; lead: ReactNode; points: [string, string, string] };

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
    spot: "menu",
    title: "Settings and what's new",
    lead: "Your photo opens the menu.",
    points: ["Settings, for theme and sharing", "What's new, when Uplink adds something", "Feedback, straight to the person who builds Uplink"],
  },
];

const SPOTS = Object.keys(TOUR_TARGETS) as TourSpot[];
// The picture is 480px wide on a desktop and 340px on a phone (TourSlice); its height follows.
const PHONE_HEIGHT = 340 * (TOUR_SHOT.height / TOUR_SHOT.width);

// The left half: the real page for the step, in the app's own theme, with an outline round the part the step
// is about and a pointer that glides to it. All five pictures sit stacked and cross-fade, so the outline and
// pointer move over a picture that changes under them. Decorative: the words say all of it.
function Preview({ spot }: { spot: TourSpot }) {
  const t = TOUR_TARGETS[spot];
  // On a phone only the top 230px shows: lift the picture so the part the step is about is in view.
  const lift = -Math.max(0, (t.at.y / 100) * PHONE_HEIGHT - 110);
  return (
    <div aria-hidden="true" className="relative h-full min-h-0 overflow-hidden">
      <TourBackdrop />
      <TourSlice lift={lift}>
        <div className="relative border bg-background shadow-xl" style={{ aspectRatio: `${TOUR_SHOT.width} / ${TOUR_SHOT.height}` }}>
          {SPOTS.map((s) => (
            <span key={s} className={cn("absolute inset-0 motion-safe:transition-opacity motion-safe:duration-300", s === spot ? "opacity-100" : "opacity-0")}>
              <Image src={`/whats-new/tour/${s}-light.webp`} alt="" fill sizes="480px" className="object-cover dark:hidden" />
              <Image src={`/whats-new/tour/${s}-dark.webp`} alt="" fill sizes="480px" className="hidden object-cover dark:block" />
            </span>
          ))}
          <span
            className="absolute outline-2 outline-offset-2 outline-chart-accent motion-safe:transition-[left,top,width,height] motion-safe:duration-[600ms] motion-safe:ease-[cubic-bezier(.2,.7,.2,1)]"
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
  steps.map((s) => ({
  key: s.name,
  label: s.name,
  title: s.title,
  description: s.lead,
  extra: (
    <ul className="mt-5 space-y-2.5">
      {s.points.map((point) => (
        <li key={point} className="flex items-start gap-3 text-[15px] leading-snug text-foreground">
          <span aria-hidden="true" className="mt-[0.5em] size-1.5 shrink-0 bg-foreground/60" />
          {point}
        </li>
      ))}
    </ul>
  ),
  preview: <Preview spot={s.spot} />,
}));

const TOUR_STEPS = toSteps(STEPS);

// Someone viewing a shared car: their own first step, then the owner tour's Home, Stats, Updates and Compare.
const GUEST_STEPS = toSteps([
  {
    name: "Guest mode",
    spot: "home",
    title: "You're seeing a shared car",
    lead: "Someone shared their car with you.",
    points: ["Look around, nothing can be changed", "No Tesla account needed", "Exit, at the bottom, leaves guest mode"],
  },
  ...STEPS.slice(0, 4),
]);

// `persist`: Home's own (closing writes "welcomed" to the account, fire and forget). Settings replays it with
// persist off, so that closing writes nothing. Open on its own unless `open` is given.
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

// Settings > General: "Show" replays the tour right there. Writes nothing.
export function WelcomeTourButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Tour
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
  return <TourDialog steps={GUEST_STEPS} onOpenChange={(next) => !next && (document.cookie = guestTourSeenCookie())} />;
}
