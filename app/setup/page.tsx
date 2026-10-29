import type { Metadata } from "next";
import { CircleCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Header } from "@/components/header";
import { buttonVariants } from "@/components/ui/button";
import { DEMO, DEMO_SITE, demoScenario } from "@/lib/demo";
import { demoLastReadingAt } from "@/lib/server/demo";
import { formatAgo } from "@/lib/format";
import { type CarSetup, carLive, KEY_PAIRING_URL, keyStep, type StepState, streamingLive, streamingStep } from "@/lib/setup-status";
import { currentOwner, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { loadSetup, type SetupView } from "@/lib/server/setup";
import { cn } from "@/lib/utils";
import { CheckAgain } from "./check-again";
import scan from "./guide/key-1-scan.jpg";
import approve from "./guide/key-2-approve.jpg";
import added from "./guide/key-3-done.jpg";

export const metadata: Metadata = { title: "Setup · Uplink" };

// Demo mode has no Tesla: one car part way through (?step=done, or the Just connected scenario, shows it finished). Its last check holds
// still for ten minutes, so Check again (which asks no one in demo) says nothing changed, as a real one would.
function demoView(done: boolean): SetupView {
  const at = new Date(Math.floor(Date.now() / 600_000) * 600_000 - 2 * 60_000).toISOString();
  const car: CarSetup = {
    vin: "DEMO",
    name: "Demo car",
    keyPaired: done,
    keyCheckedAt: at,
    streaming: done ? "synced" : null,
    streamingCheckedAt: done ? at : null,
    configSentAt: null,
  };
  return { cars: [car], canSend: true, needsLocation: false, checkedAt: at, lastReadings: { DEMO: done ? demoLastReadingAt() : null } };
}

// Only states worth saying: a step still to do needs no label.
const STEP_WORDS: Partial<Record<StepState, string>> = { unknown: "Not known yet" };

// A finished step: a green circled tick. Live data that has started arriving gets a soft pulse instead, as
// it keeps running. Reduced motion: the dot holds still.
function StepBadge({ state, live = false }: { state: StepState; live?: boolean }) {
  if (state === "done" && live) {
    return (
      <span className="inline-flex items-center gap-2 text-sm whitespace-nowrap text-positive">
        <span aria-hidden className="relative flex size-2.5">
          <span className="absolute inset-0 animate-ping rounded-full bg-positive opacity-60 motion-reduce:animate-none" />
          <span className="relative size-2.5 rounded-full bg-positive" />
        </span>
        Live
      </span>
    );
  }
  if (state === "done") {
    return (
      <span className="text-positive">
        <CircleCheck aria-hidden className="size-6" />
        <span className="sr-only">Done</span>
      </span>
    );
  }
  if (!STEP_WORDS[state]) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground">
      <span aria-hidden className="size-1.5 rounded-full bg-faint" />
      {STEP_WORDS[state]}
    </span>
  );
}

function Step({ n, title, state, live, children }: { n: number; title: string; state: StepState; live?: boolean; children: React.ReactNode }) {
  return (
    <li className="space-y-4 border-t py-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium tracking-heading">
          <span className="mr-1.5 text-muted-foreground tabular-nums">{n}.</span>
          {title}
        </h2>
        <StepBadge state={state} live={live} />
      </div>
      {children}
    </li>
  );
}

const carName = (car: CarSetup, i: number, all: CarSetup[]) => car.name || (all.length > 1 ? `Car ${i + 1}` : "Your car");

function keyWords(car: CarSetup): string {
  if (car.keyPaired === true) return "Key added";
  if (car.keyPaired === false) return "No key yet";
  return "Not known yet";
}

function streamingWords(car: CarSetup, canSend: boolean, needsLocation: boolean, live: boolean): string {
  if (car.streaming === "synced") return live ? "Live" : "Ready";
  if (car.keyPaired !== true) return "Waiting for the key";
  if (car.streaming === "pending") return "Starts when the car is next awake";
  if (car.streaming === "full") return "The car has no room for another app";
  if (car.streaming === "none") return !canSend ? "Uplink will turn this on" : needsLocation ? "Needs location access" : "Turning on";
  return "Not known yet";
}

// A solid key (Heroicons, MIT): lucide's key is an outline, and filling it reads oddly.
function SolidKey() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="currentColor" className="size-5">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M15.75 1.5a6.75 6.75 0 0 0-6.651 7.906c.067.39-.032.717-.221.906l-6.5 6.499a3 3 0 0 0-.878 2.121v2.818c0 .414.336.75.75.75H6a.75.75 0 0 0 .75-.75v-1.5h1.5A.75.75 0 0 0 9 19.5V18h1.5a.75.75 0 0 0 .53-.22l2.658-2.658c.19-.189.517-.288.906-.22A6.75 6.75 0 1 0 15.75 1.5Zm0 3a.75.75 0 0 0 0 1.5A2.25 2.25 0 0 1 18 8.25a.75.75 0 0 0 1.5 0 3.75 3.75 0 0 0-3.75-3.75Z"
      />
    </svg>
  );
}

// Per-car status, only when there's more than one car: with one, the step's own state says it all.
function CarList({ cars, words }: { cars: CarSetup[]; words: (car: CarSetup) => string }) {
  if (cars.length < 2) return null;
  return (
    <ul className="divide-y border-t text-sm">
      {cars.map((car, i) => (
        <li key={car.vin} className="flex items-baseline justify-between gap-4 py-2.5">
          <span className="truncate">{carName(car, i, cars)}</span>
          <span className="shrink-0 text-right text-muted-foreground">{words(car)}</span>
        </li>
      ))}
    </ul>
  );
}

// What adding the key looks like, from the owner's own phone (car name, owner and Tesla's code blurred). Three across from sm up;
// on a phone they scroll sideways in their own row so the page doesn't.
const GUIDE = [
  { image: scan, alt: "Tesla's page with a code to scan", caption: "Scan the QR code with your phone" },
  { image: approve, alt: "The Tesla app asking to allow access for app.getuplink.in", caption: "Tap Approve" },
  { image: added, alt: "The Tesla app saying Success", caption: "Come back and tap Check again" },
];

function KeyGuide() {
  return (
    <div>
      <ol className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible">
        {GUIDE.map(({ image, alt, caption }, i) => (
          <li key={i} className="w-[45%] shrink-0 snap-start sm:w-auto">
            <Image src={image} alt={alt} sizes="(min-width: 640px) 200px, 45vw" className="rounded-2xl border" />
            <p className="mt-2 text-sm font-medium">
              <span className="text-muted-foreground">{i + 1}.</span> {caption}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

async function SetupContent({ searchParams }: Pick<PageProps<"/setup">, "searchParams">) {
  const params = await searchParams;
  // Per request: the status and the clock are read now, never prerendered.
  await connection();
  let view: SetupView;
  let now: number;
  if (DEMO) {
    view = demoView(params.step === "done" || demoScenario() === "justConnected");
    now = Date.now();
  } else {
    const owner = await currentOwner();
    if (!owner) redirect(SIGNED_OUT_PATH);
    view = await loadSetup(owner);
    now = Date.now();
  }
  const { cars, canSend } = view;
  const key = keyStep(cars);
  const streaming = streamingStep(cars);
  // Live once a reading has arrived; until then the step is ready and the car only has to wake.
  const live = streamingLive(cars, view.lastReadings);
  // Both steps done: nothing left to check, so the page says so and leads on.
  const ready = key === "done" && streaming === "done";
  return (
    <>
      {cars.length === 0 && (
        <p className="mb-6 text-sm text-muted-foreground">Uplink is still finding your car on your Tesla account. Check again in a minute.</p>
      )}
      {/* Both done: said first, in the open, with the way on. */}
      {ready && (
        <div role="status" className="mb-8 flex flex-wrap items-center gap-x-4 gap-y-3 border border-positive/40 bg-positive/5 p-4">
          <CircleCheck aria-hidden className="size-6 shrink-0 text-positive" />
          <div className="min-w-48 flex-1">
            <p className="font-medium">Your car is set up</p>
            <p className="text-sm text-muted-foreground">It sends live data whenever it&apos;s awake.</p>
          </div>
          <Link href="/" prefetch={true} className={cn(buttonVariants({ size: "lg" }), "max-sm:w-full")}>
            Go to your dashboard
          </Link>
        </div>
      )}
      <ol>
        <Step n={1} title="Add Uplink's key" state={key}>
          <p className="text-sm text-muted-foreground">
            The key lets your car send data to Uplink. It can&apos;t unlock or drive the car.
          </p>
          {key !== "done" && (
            <a href={KEY_PAIRING_URL} className={cn(buttonVariants({ size: "lg" }), "glow h-11 w-full gap-2 px-4 text-base sm:w-auto")}>
              <SolidKey />
              Connect your car
            </a>
          )}
          {/* Once the key is on, the photos are a tap away instead of in the way. */}
          {key === "done" ? (
            <details>
              <summary className="cursor-pointer text-sm text-muted-foreground underline decoration-muted-foreground/60 underline-offset-4 hover:text-foreground hover:decoration-foreground">
                See how
              </summary>
              <div className="pt-4">
                <KeyGuide />
              </div>
            </details>
          ) : (
            <KeyGuide />
          )}
          {/* Tesla's app says "Request timed out" when the car is asleep or out of reach while the key is added. */}
          <p className="text-xs text-faint">
            {key !== "done" && "Request timed out? Wake the car and try again. "}Remove the key any time in the car&apos;s Controls, then Locks.
          </p>
          <CarList cars={cars} words={keyWords} />
        </Step>
        <Step n={2} title="Turn on live data" state={streaming} live={live}>
          <p className="text-sm text-muted-foreground">
            {streaming === "done"
              ? live
                ? "Your car is sending live data."
                : "Ready. Your car sends data the next time it's awake."
              : canSend
                ? "Once the key is added, Uplink turns on live data. The car starts sending the next time it's awake."
                : "Once the key is added, Uplink turns this on for you."}
          </p>
          {!(canSend && view.needsLocation && streaming !== "done") && (
            <p className="text-sm text-muted-foreground">
              Live data includes where your car goes.{" "}
              <Link href="/privacy" className="underline decoration-muted-foreground/60 underline-offset-4 hover:text-foreground hover:decoration-foreground">
                Read the privacy page
              </Link>
            </p>
          )}
          {canSend && view.needsLocation && streaming !== "done" && (
            <p className="text-sm">
              Live data includes where your car is. Tesla shares that only if you allow location.{" "}
              <a href="/api/auth/connect" className="underline decoration-muted-foreground/60 underline-offset-4 hover:decoration-foreground">
                Sign in again
              </a>{" "}
              and allow it.
            </p>
          )}
          <CarList cars={cars} words={(car) => streamingWords(car, canSend, view.needsLocation, carLive(car.vin, view.lastReadings))} />
        </Step>
      </ol>
      {!ready && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-6">
          <CheckAgain checkedAt={view.checkedAt} />
          {key === "done" && (
            <Link href="/" prefetch={true} className={buttonVariants({ size: "lg" })}>
              Go to your dashboard
            </Link>
          )}
          {view.checkedAt && <p className="text-xs text-faint">Setup last checked {formatAgo(view.checkedAt, now)}</p>}
        </div>
      )}
      {!ready && (
        <p className="mt-10 text-sm text-muted-foreground">
          Without live data, Uplink still checks your car every 12 hours for its software version, battery and charging.
        </p>
      )}
    </>
  );
}

export default function SetupPage({ searchParams }: PageProps<"/setup">) {
  // The public demo site's sample car has nothing to set up; local demo mode keeps the page to preview it.
  if (DEMO_SITE) notFound();
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6 pb-12 sm:pt-8 sm:pb-20">
      <Header setup={false} onSetup />
      <h1 className="text-[1.5rem] font-medium tracking-heading max-sm:text-[1.25rem]">Set up your car</h1>
      <p className="mt-1 mb-8 text-sm text-muted-foreground">Two steps, and your car sends Uplink live data.</p>
      <Suspense fallback={<div role="status" aria-busy="true" className="h-64 bg-muted motion-safe:animate-pulse"><span className="sr-only">Loading…</span></div>}>
        <SetupContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
