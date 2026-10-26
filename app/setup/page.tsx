import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Header } from "@/components/header";
import { buttonVariants } from "@/components/ui/button";
import { DEMO } from "@/lib/demo";
import { formatAgo } from "@/lib/format";
import { type CarSetup, KEY_PAIRING_URL, keyStep, type StepState, streamingStep } from "@/lib/setup-status";
import { currentOwner, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { loadSetup, type SetupView } from "@/lib/server/setup";
import { cn } from "@/lib/utils";
import { CheckAgain } from "./check-again";

export const metadata: Metadata = { title: "Setup · Uplink" };

// Demo mode has no Tesla: one car part way through (?step=done shows it finished).
function demoView(done: boolean): SetupView {
  const at = new Date(Date.now() - 2 * 60_000).toISOString();
  const car: CarSetup = {
    vin: "DEMO",
    name: "Demo car",
    keyPaired: done,
    keyCheckedAt: at,
    streaming: done ? "synced" : null,
    streamingCheckedAt: done ? at : null,
    configSentAt: null,
  };
  return { cars: [car], canSend: true, checkedAt: at };
}

const STEP_WORDS: Record<StepState, string> = { done: "Done", todo: "To do", waiting: "Next", unknown: "Not known yet" };

function StepBadge({ state }: { state: StepState }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs whitespace-nowrap", state === "done" ? "text-foreground" : "text-muted-foreground")}>
      <span aria-hidden className={cn("size-1.5 rounded-full", state === "done" ? "bg-positive" : state === "todo" ? "bg-foreground" : "bg-faint")} />
      {STEP_WORDS[state]}
    </span>
  );
}

function Step({ n, title, state, children }: { n: number; title: string; state: StepState; children: React.ReactNode }) {
  return (
    <li className="space-y-4 border-t py-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-medium tracking-heading">
          <span className="mr-2 font-mono text-sm text-faint tabular-nums">{n}</span>
          {title}
        </h2>
        <StepBadge state={state} />
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

function streamingWords(car: CarSetup, canSend: boolean): string {
  if (car.streaming === "synced") return "Live";
  if (car.keyPaired !== true) return "Waiting for the key";
  if (car.streaming === "pending") return "Starts when the car is next online";
  if (car.streaming === "full") return "The car has no room for another app";
  if (car.streaming === "none") return canSend ? "Turning on" : "Uplink will turn this on";
  return "Not known yet";
}

function CarList({ cars, words }: { cars: CarSetup[]; words: (car: CarSetup) => string }) {
  if (cars.length < 1) return null;
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

async function SetupContent({ searchParams }: Pick<PageProps<"/setup">, "searchParams">) {
  const params = await searchParams;
  // Per request: the status and the clock are read now, never prerendered.
  await connection();
  let view: SetupView;
  let now: number;
  if (DEMO) {
    view = demoView(params.step === "done");
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
  return (
    <>
      {cars.length === 0 && (
        <p className="mb-6 text-sm text-muted-foreground">Uplink hasn&apos;t seen a car on your Tesla account yet. Check again in a minute.</p>
      )}
      <ol>
        <Step n={1} title="Add Uplink's key" state={key}>
          {key !== "done" && (
            <p className="text-sm text-muted-foreground">
              Open this link on the phone with the Tesla app, then approve the key in the app or on the car&apos;s screen.
            </p>
          )}
          {key !== "done" && (
            <a href={KEY_PAIRING_URL} className={cn(buttonVariants({ size: "lg" }), "h-12 w-full text-base sm:w-auto sm:px-8")}>
              Add the key in the Tesla app
            </a>
          )}
          <p className="text-sm text-muted-foreground">
            The key lets your car send its data to Uplink. Uplink sends your car no commands, and you can remove the key in the car&apos;s Locks
            settings at any time.
          </p>
          <CarList cars={cars} words={keyWords} />
        </Step>
        <Step n={2} title="Turn on live data" state={streaming}>
          <p className="text-sm text-muted-foreground">
            {canSend
              ? "Once the key is on, Uplink turns on live data for you. The car starts sending the next time it's online."
              : "Once the key is on, Uplink will turn this on for you."}
          </p>
          <CarList cars={cars} words={(car) => streamingWords(car, canSend)} />
        </Step>
      </ol>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-6">
        <CheckAgain />
        {key === "done" && (
          <Link href="/" prefetch={true} className={buttonVariants({ size: "lg" })}>
            Open Uplink
          </Link>
        )}
        {view.checkedAt && <p className="text-xs text-faint">Checked {formatAgo(view.checkedAt, now)}</p>}
      </div>
      <p className="mt-10 text-sm text-muted-foreground">
        Without these, Uplink still checks your car every 6 hours for its software version, battery and charging.
      </p>
    </>
  );
}

export default function SetupPage({ searchParams }: PageProps<"/setup">) {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6 pb-12 sm:pt-8 sm:pb-20">
      <Header setup={false} />
      <h1 className="text-[1.5rem] font-medium tracking-heading max-sm:text-[1.25rem]">Set up your car</h1>
      <p className="mt-1 mb-8 text-sm text-muted-foreground">Two steps, and your car sends Uplink live data.</p>
      <Suspense fallback={<div role="status" aria-busy="true" className="h-64 bg-muted motion-safe:animate-pulse"><span className="sr-only">Loading…</span></div>}>
        <SetupContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
