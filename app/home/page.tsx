import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronDown, CircleCheck, CircleX } from "lucide-react";
import { DashboardPreview } from "@/components/dashboard-preview";
import { FeatureBento } from "@/components/home/feature-bento";
import { CONTACT_EMAIL } from "@/components/plain-page";
import { HeaderScroll } from "@/components/header-scroll";
import { ThemePicker } from "@/components/theme-picker";
import { loadStatus } from "@/lib/server/status";
import { overallHeadline, type Status } from "@/lib/status";
import { SessionCta } from "@/components/home/session-cta";
import { LoginError } from "@/components/login-error";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { DEMO_URL } from "@/lib/demo";
import { HOME_URL, OPEN_GRAPH, STATUS_URL, TAGLINE, TWITTER } from "@/lib/site";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const DESCRIPTION = "Software updates, Supercharger spend, battery and kilometres driven for your Tesla in India. Read-only.";

// Served at getuplink.in/ (proxy.ts rewrites it to /home), so its links and preview image use that host.
export const metadata: Metadata = {
  metadataBase: new URL(HOME_URL),
  title: { absolute: "Uplink · Your Tesla's updates, charging and driving, on one page" },
  description: DESCRIPTION,
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
  openGraph: { ...OPEN_GRAPH, url: "/", title: "Uplink", description: TAGLINE },
  twitter: { ...TWITTER, title: "Uplink", description: TAGLINE },
};

const STEPS = [
  {
    title: "Sign in on Tesla's page",
    body: "Uplink never sees your password. Tesla's page asks for your car's location and charging access. Uplink only reads them.",
  },
  { title: "Add Uplink's key to your car", body: "The key lets your car send data to Uplink. It can't unlock or drive." },
  { title: "Your data builds up", body: "Charts fill in as your car sends data. Battery trends take about two weeks." },
];

const CAN = [
  "Software version and update progress",
  "Battery, charging and odometer",
  "Supercharger charges and invoices",
  "Trips, with where the car went",
  "India rollout map",
  "Compare with other owners, if you share",
];

const CANNOT = [
  "Wake your car",
  "Unlock, drive or send commands",
];

const FAQ = [
  {
    q: "Why add Uplink's key to my car?",
    a: "It lets your car send live data. It can't unlock or drive, and you can remove it in the car's Controls > Locks.",
  },
  { q: "Which cars work?", a: "Any Tesla that works with apps like Uplink, including the Indian Model Y." },
  {
    q: "How do I delete my data?",
    a: "Use Delete my data in Settings, or Delete account to remove your account too. Then remove Uplink's key in your car's Controls > Locks.",
  },
];

// Padded to a 44px-tall target without moving the text.
const FOOTER_LINK = "px-2 py-3 text-muted-foreground transition-colors duration-150 hover:text-foreground";

// Cached so the page stays static: the year is read through the cache, not per request.
async function Year() {
  "use cache";
  return new Date().getFullYear();
}

// The home page's own sections, linked from the header from sm up.
const SECTIONS = [
  { id: "how", label: "How it works" },
  { id: "keeps", label: "What it keeps" },
  { id: "faq", label: "FAQ" },
];

function Ctas({ className }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-3 ${className ?? ""}`}>
      <Suspense>
        <SessionCta visitor />
      </Suspense>
      <a href={DEMO_URL} className={buttonVariants({ variant: "outline", size: "xl" })}>
        See the demo
      </a>
      <span className="text-xs text-faint">Opens a sample car on a separate site.</span>
    </div>
  );
}

const STATUS_DOT: Record<Status, string> = { operational: "bg-positive", degraded: "bg-warning", down: "bg-destructive" };

// The status page's own headline, linked to it: "Everything is working" with a green dot. Grey "Checking
// status…" until it arrives, so the footer never moves.
function StatusLine({ status, text }: { status?: Status; text?: string }) {
  return (
    <a href={STATUS_URL} className="inline-flex w-fit items-center gap-2 py-1 transition-colors duration-150 hover:text-foreground">
      <span aria-hidden="true" className={`size-1.5 rounded-full ${status ? STATUS_DOT[status] : "bg-muted-foreground/40"}`} />
      {text ?? "Checking status…"}
    </a>
  );
}

async function LiveStatus() {
  const headline = await loadStatus()
    .then(({ components }) => overallHeadline(components.map((c) => c.current)))
    .catch(() => null);
  if (!headline) return <StatusLine text="See Uplink's status" />;
  return <StatusLine status={headline.status} text={headline.text} />;
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
      {/* Stays at the top as the page scrolls, with a hairline once it has moved (sticky-bar in globals.css). */}
      <HeaderScroll />
      <header className="sticky-bar sticky top-0 z-40 flex h-16 items-center justify-between gap-4 text-sm">
        <Link href="/" className="tap-target inline-flex items-center gap-2 font-medium">
          <Logo className="size-5" />
          Uplink
        </Link>
        <div className="flex items-center gap-1">
          <nav aria-label="On this page" className="flex items-center gap-1 text-muted-foreground max-sm:hidden">
            {SECTIONS.map((section) => (
              <a key={section.id} href={`#${section.id}`} className="rounded-md px-2.5 py-1 transition-colors duration-150 hover:bg-secondary/60 hover:text-foreground motion-reduce:transition-none">
                {section.label}
              </a>
            ))}
          </nav>
          <Suspense>
            <SessionCta size="sm" signInLink className="ml-2" />
          </Suspense>
        </div>
        {/* Where "Skip to content" lands (components/skip-link.tsx). */}
        <span id="content-start" tabIndex={-1} className="absolute top-full left-0 outline-none" />
      </header>

      {/* Hero: the job, the price and the risk, all above the fold. */}
      <section className="grid grid-cols-[minmax(0,1fr)] items-center gap-16 py-20 lg:grid-cols-2 lg:gap-12 lg:py-28">
        <div>
          <p className="text-xs tracking-wide text-faint uppercase">For Tesla owners in India</p>
          <h1 className="mt-5 text-4xl leading-display font-medium tracking-[-0.045em] text-balance sm:text-5xl 2xl:text-6xl">
            Your Tesla, on one page.
          </h1>
          <p className="mt-6 max-w-md text-lg text-muted-foreground">
            Updates, trips, charging and battery for your Tesla, from the day you sign in.
          </p>
          <p className="mt-4 text-sm font-medium">Free for now. This may change.</p>
          {/* One way in and one way to look first: signed in, Dashboard; signed out, the way in for someone new
              (Join the waitlist or Ask for an invite, as SIGNUP_MODE allows). The demo is the quieter button. */}
          <Ctas className="mt-8" />
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
      <section id="how" className="scroll-mt-16 border-t py-20">
        <h2 className="text-3xl leading-display font-medium tracking-[-0.045em] text-balance sm:text-4xl">
          Set up once.
        </h2>
        <div className="mt-12">
          <Steps />
        </div>
      </section>

      {/* What Uplink keeps: one grid of tiles, each with a piece of the product. */}
      <section id="keeps" className="scroll-mt-16 border-t py-20">
        <h2 className="text-4xl leading-display font-medium tracking-[-0.045em] text-balance sm:text-5xl">What Uplink keeps</h2>
        <div className="mt-12">
          <FeatureBento />
        </div>
      </section>

      {/* Trust: what Uplink can and can't do, side by side. */}
      <section id="read-only" className="scroll-mt-16 border-t py-24">
        <h2 className="text-4xl leading-display font-medium tracking-[-0.045em] text-balance sm:text-5xl">Read-only by design</h2>
        <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
          Uplink uses Tesla&apos;s official data access, and only reads.
        </p>
        <div className="mt-12 grid overflow-hidden rounded-lg border sm:grid-cols-2">
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
          <Link href="/privacy" className="tap-target underline decoration-muted-foreground/60 underline-offset-4 hover:text-foreground">
            Read the privacy page
          </Link>
        </p>
      </section>

      <section id="faq" className="scroll-mt-16 border-t py-24">
        <h2 className="text-4xl leading-display font-medium tracking-[-0.045em] text-balance sm:text-5xl">FAQ</h2>
        <div className="mt-12 max-w-3xl divide-y border-y">
          {FAQ.map((item) => (
            <Collapsible key={item.q} className="group">
              <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-between gap-4 py-5 text-left text-base font-medium">
                {item.q}
                <ChevronDown
                  className="size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none duration-150 group-data-open:rotate-180"
                  aria-hidden="true"
                />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <p className="max-w-2xl pb-5 text-base text-muted-foreground">{item.a}</p>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      </section>

      {/* The ask again at the end, for whoever read this far. */}
      <section className="border-t py-24">
        <h2 className="text-4xl leading-display font-medium tracking-[-0.045em] text-balance sm:text-5xl">Ready to see your car?</h2>
        <p className="mt-5 max-w-2xl text-lg text-muted-foreground">Read-only. Never wakes your car. Revoke access any time.</p>
        <Ctas className="mt-10" />
      </section>

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border-t py-8 text-xs text-faint">
        <div className="flex flex-col gap-1">
          <span>
            &copy; <Year /> · Uplink is not affiliated with Tesla, Inc.
          </span>
          <Suspense fallback={<StatusLine />}>
            <LiveStatus />
          </Suspense>
        </div>
        <div className="ml-auto">
          <ThemePicker />
        </div>
        <nav aria-label="Legal" className="ml-auto flex gap-x-2">
          <Link href="/privacy" className={FOOTER_LINK}>
            Privacy
          </Link>
          <Link href="/terms" className={FOOTER_LINK}>
            Terms
          </Link>
          <Link href={STATUS_URL} className={FOOTER_LINK}>
            Status
          </Link>
          <a href={`mailto:${CONTACT_EMAIL}`} className={FOOTER_LINK}>
            Contact
          </a>
        </nav>
      </footer>
    </div>
  );
}
