"use client";

import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The shell both Home dialogs share: the welcome tour and the release dialog. A blurred Home behind, two
// halves (a picture on the left, the words on the right), and a footer with dots, Skip, Back and Next. On a
// phone it is a sheet from the bottom. Each dialog supplies its steps. Closing is never more than one tap.

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
// `lift` (px, negative) moves the picture up on a phone, where only the top shows.
export function TourSlice({ children, lift = 0 }: { children: ReactNode; lift?: number }) {
  return (
    <div className="absolute inset-0 overflow-hidden [mask-image:linear-gradient(to_bottom,#000_72%,transparent_100%)]">
      <div
        className="absolute top-4 left-4 w-[340px] max-sm:translate-y-[var(--lift)] max-sm:motion-safe:transition-transform max-sm:motion-safe:duration-[600ms] sm:top-7 sm:left-7 sm:w-[480px]"
        style={{ "--lift": `${lift}px` } as CSSProperties}
      >
        {children}
      </div>
    </div>
  );
}

function Dots({ steps, step, onPick }: { steps: TourStep[]; step: number; onPick: (n: number) => void }) {
  return (
    <div className="flex items-center">
      {steps.map((s, i) => (
        <button
          key={s.key}
          type="button"
          aria-label={`Step ${i + 1} of ${steps.length}`}
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
function Popup({ steps }: { steps: TourStep[] }) {
  const [n, setN] = useState(0);
  const popup = useRef<HTMLDivElement>(null);
  const step = steps[n];
  const last = n === steps.length - 1;
  const go = (to: number) => setN(Math.max(0, Math.min(steps.length - 1, to)));
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
        <div className="relative h-full min-h-0 overflow-hidden">{step.preview}</div>
      </div>
      <div className="relative flex min-h-0 min-w-0 flex-col p-5 sm:p-8">
        <div className="flex items-center gap-2.5 pr-9 text-sm text-faint max-sm:pr-0">
          {step.chip}
          {step.label}
        </div>
        <div className="min-h-[14rem] flex-1 pt-4 sm:flex sm:min-h-0 sm:flex-col sm:justify-center sm:pt-0">
          <Dialog.Title className="max-w-[16ch] text-xl leading-tight font-semibold tracking-heading text-balance sm:max-w-[20ch] sm:text-[1.75rem]">{step.title}</Dialog.Title>
          <Dialog.Description className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-[15px]">{step.description}</Dialog.Description>
          {step.extra}
        </div>
        <div className="flex items-center justify-between gap-2 pt-4">
          <Dots steps={steps} step={n} onPick={go} />
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
              <Button onClick={() => go(n + 1)}>Next</Button>
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

// Open on its own unless `open` is given. `onOpenChange` hears every change, so a caller can store that the
// dialog was closed.
export function TourDialog({ steps, open, onOpenChange }: { steps: TourStep[]; open?: boolean; onOpenChange?: (open: boolean) => void }) {
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
  return (
    <Dialog.Root
      open={open ?? own}
      onOpenChange={(next) => {
        setOwn(next);
        onOpenChange?.(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/30 backdrop-blur-xs motion-safe:transition-opacity motion-safe:duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Popup steps={steps} />
      </Dialog.Portal>
    </Dialog.Root>
  );
}
