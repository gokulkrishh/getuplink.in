import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronDown, CircleCheck, CircleX } from "lucide-react";
import { DashboardPreview } from "@/components/dashboard-preview";
import { AssistantMock } from "@/components/home/assistant-mock";
import { CarGlanceMock } from "@/components/home/car-glance-mock";
import { HistoryMock } from "@/components/home/history-mock";
import { InviteOnly } from "@/components/home/invite-only";
import { SessionCta } from "@/components/home/session-cta";
import { LoginError } from "@/components/login-error";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { DEMO_URL } from "@/lib/demo";
import { HOME_URL, OPEN_GRAPH, TAGLINE, TWITTER } from "@/lib/site";

const DESCRIPTION = "Software updates, Supercharger spend, battery and kilometres driven for your Tesla in India. Read-only.";

// Served at getuplink.in/ (proxy.ts rewrites it to /home), so its links and preview image use that host.
export const metadata: Metadata = {
  metadataBase: new URL(HOME_URL),
  title: { absolute: "Uplink · Your Tesla's updates, charging and driving, in one place" },
  description: DESCRIPTION,
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
  openGraph: { ...OPEN_GRAPH, url: "/", title: "Uplink", description: TAGLINE },
  twitter: { ...TWITTER, title: "Uplink", description: TAGLINE },
};

const STEPS = [
  { title: "Sign in on Tesla's page", body: "Uplink never sees your password." },
  { title: "Add Uplink's key to your car", body: "Lets the car send data. Can't unlock or drive." },
  { title: "Updates show up on their own", body: "Data arrives whenever your car is awake." },
];

const SHOWCASE = [
  {
    title: "Your car's whole history",
    body: "The Tesla app shows today. Uplink keeps the rest.",
    points: ["How long each update waited", "Odometer at every update", "Supercharging spend in rupees"],
    mock: <HistoryMock />,
  },
  {
    title: "Your car at a glance",
    body: "Charge, battery health, distance and specs from your car.",
    points: ["Charge, range and limit", "Battery health and odometer", "Kilometres driven each month"],
    mock: <CarGlanceMock />,
  },
  {
    title: "Ask your AI about your car",
    body: "Connect Claude, ChatGPT, Grok or an always-on bot to Uplink.",
    points: [
      "Drives, trips and kilometres driven",
      "Charging spend and battery health",
      "An always-on bot that adds charging invoices from Gmail",
      "Can't reach or control your car",
    ],
    mock: <AssistantMock />,
  },
];

const CAN = [
  "Software version and update progress",
  "Battery, charging and odometer",
  "Supercharger charges and invoices",
  "Trips, with where the car went",
];

const CANNOT = [
  "Wake your car",
  "Unlock, drive or send commands",
];

const FAQ = [
  {
    q: "Why add Uplink's key to my car?",
    a: "It lets your car send live data. It can't unlock or drive, and you can remove it in Locks settings.",
  },
  { q: "Which cars work?", a: "Any Tesla that works with apps like Uplink, including the Indian Model Y." },
  {
    q: "How do I delete my data?",
    a: "Use Delete my data in Settings, or Delete account to remove your account too. Then remove Uplink's key in your car's Locks settings.",
  },
];

// Cached so the page stays static: the year is read through the cache, not per request.
async function Year() {
  "use cache";
  return new Date().getFullYear();
}

function Steps() {
  return (
    <ol className="grid gap-x-10 gap-y-8 sm:grid-cols-3">
      {STEPS.map((step, i) => (
        <li key={step.title} className="border-t pt-5">
          <span className="font-mono text-xs text-faint tabular-nums">0{i + 1}.</span>
          <h3 className="mt-3 text-base font-medium">{step.title}</h3>
          <p className="mt-2 text-base text-muted-foreground">{step.body}</p>
        </li>
      ))}
    </ol>
  );
}

export default function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 sm:px-8">
      <header className="flex h-16 items-center justify-between gap-4 text-sm">
        <Link href="/" className="inline-flex items-center gap-2 font-medium">
          <Logo className="size-5" />
          Uplink
        </Link>
        <Suspense>
          <SessionCta size="sm" signInLink />
        </Suspense>
      </header>

      {/* Hero: the job, the price and the risk, all above the fold. */}
      <section className="grid items-center gap-16 py-20 lg:grid-cols-2 lg:gap-12 lg:py-28">
        <div>
          <p className="text-xs tracking-wide text-faint uppercase">For Tesla owners in India</p>
          <h1 className="mt-5 text-4xl leading-display font-semibold tracking-tight text-balance sm:text-5xl 2xl:text-6xl">
            Your Tesla, all in one place.
          </h1>
          <p className="mt-6 max-w-md text-lg text-muted-foreground">
            Software updates, charging spend, battery and kilometres driven.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            {/* Signed in: Dashboard. Signed out: nothing here; sign-up is by invite link, sign-in is in the header. */}
            <Suspense>
              <SessionCta dashboardOnly />
            </Suspense>
            <a href={DEMO_URL} className={buttonVariants({ size: "xl" })}>
              See the demo
            </a>
            <InviteOnly />
          </div>
          <p className="mt-6 text-xs text-faint">Read-only · Never wakes your car · Revoke access any time</p>
          {/* Renders nothing (and takes no space) unless sign-in failed, so the page doesn't shift. */}
          <Suspense>
            <LoginError className="mt-4" />
          </Suspense>
        </div>
        <div className="flex justify-center lg:justify-end">
          <DashboardPreview />
        </div>
      </section>

      {/* How it works, early: the effort is small, so show it before the features. */}
      <section id="how" className="scroll-mt-16 py-20">
        <h2 className="text-3xl leading-display font-semibold tracking-tight text-balance sm:text-4xl">
          Set up once.
        </h2>
        <div className="mt-12">
          <Steps />
        </div>
      </section>

      {SHOWCASE.map((item, i) => (
        <section key={item.title} className="grid items-center gap-14 py-20 lg:grid-cols-2 lg:gap-16">
          <div className={i % 2 === 1 ? "lg:order-2" : undefined}>
            <h2 className="text-4xl leading-display font-semibold tracking-tight text-balance sm:text-5xl">{item.title}</h2>
            <p className="mt-5 text-lg text-muted-foreground">{item.body}</p>
            <ul className="mt-8 flex flex-col gap-3">
              {item.points.map((point) => (
                <li key={point} className="flex items-baseline gap-3 text-base">
                  <CircleCheck className="size-4 shrink-0 translate-y-0.5 text-muted-foreground" aria-hidden="true" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <div className={i % 2 === 1 ? "lg:order-1" : undefined}>{item.mock}</div>
        </section>
      ))}

      {/* Trust: what Uplink can and can't do, side by side. */}
      <section className="py-24">
        <h2 className="text-4xl leading-display font-semibold tracking-tight text-balance sm:text-5xl">Read-only by design</h2>
        <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
          Tesla&apos;s official Fleet API, read access only.
        </p>
        <div className="mt-12 grid border sm:grid-cols-2">
          <div className="p-6 sm:p-8">
            <h3 className="text-xs tracking-wide text-faint uppercase">Uplink can</h3>
            <ul className="mt-5 flex flex-col gap-4">
              {CAN.map((line) => (
                <li key={line} className="flex items-baseline gap-3 text-base">
                  <CircleCheck className="size-4 shrink-0 translate-y-0.5 text-positive" aria-hidden="true" />
                  {line}
                </li>
              ))}
            </ul>
          </div>
          <div className="border-t p-6 sm:border-t-0 sm:border-l sm:p-8">
            <h3 className="text-xs tracking-wide text-faint uppercase">Uplink can&apos;t</h3>
            <ul className="mt-5 flex flex-col gap-4">
              {CANNOT.map((line) => (
                <li key={line} className="flex items-baseline gap-3 text-base">
                  <CircleX className="size-4 shrink-0 translate-y-0.5 text-muted-foreground" aria-hidden="true" />
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          Revoke access from your Tesla account, or delete everything from Settings, any time.{" "}
          <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
            Read the privacy page
          </Link>
        </p>
      </section>

      <section id="faq" className="scroll-mt-16 py-24">
        <h2 className="text-4xl leading-display font-semibold tracking-tight text-balance sm:text-5xl">FAQ</h2>
        <div className="mt-12 max-w-3xl divide-y border-y">
          {FAQ.map((item) => (
            <details key={item.q} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-base font-medium [&::-webkit-details-marker]:hidden">
                {item.q}
                <ChevronDown
                  className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <p className="max-w-2xl pb-5 text-base text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="flex flex-col items-start gap-8 py-28">
        <h2 className="max-w-3xl text-5xl leading-display font-semibold tracking-tight text-balance sm:text-6xl">
          Invited? Set up in two minutes.
        </h2>
        <p className="-mt-4 max-w-md text-lg text-muted-foreground">Open your invite link to sign in with Tesla.</p>
        <div className="flex flex-wrap items-center gap-3">
          <Suspense>
            <SessionCta dashboardOnly />
          </Suspense>
          <a href={DEMO_URL} className={buttonVariants({ variant: "secondary", size: "xl" })}>
            See the demo
          </a>
          <InviteOnly />
        </div>
      </section>

      <footer className="mt-auto flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 py-8 text-xs text-faint">
        <span>
          &copy; <Year /> · Uplink is not affiliated with Tesla, Inc.
        </span>
        <nav aria-label="Legal" className="ml-auto flex gap-4">
          <Link href="/privacy" className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
            Terms
          </Link>
          <Link href="/status" className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
            Status
          </Link>
        </nav>
      </footer>
    </div>
  );
}
