import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  BatteryMedium,
  ChevronDown,
  Download,
  History,
  MoonStar,
  ScrollText,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { DashboardPreview } from "@/components/dashboard-preview";
import { HistoryMock } from "@/components/home/history-mock";
import { SessionCta } from "@/components/home/session-cta";
import { LoginError } from "@/components/login-error";
import { Logo } from "@/components/logo";
import { SignInButton } from "@/components/sign-in-button";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Uplink · Tesla software updates, tracked from India",
  description: "Know when your Tesla's next update lands. Every version, release note and Supercharger session, read-only.",
  robots: { index: true, follow: true },
};

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: History, title: "Version history", body: "Every software version your car has run, with when it arrived and when it installed." },
  { icon: ScrollText, title: "Release notes", body: "Tesla's own notes for each version, exactly as your car received them." },
  { icon: Download, title: "Update status", body: "Available, downloading, waiting for Wi-Fi, scheduled or installing, with progress." },
  { icon: BatteryMedium, title: "Battery at a glance", body: "Charge level, range and charge limit from the last time the car was online." },
  { icon: Zap, title: "Supercharger sessions", body: "Every session with energy, cost in rupees and the invoice, month by month." },
  { icon: MoonStar, title: "Never wakes your car", body: "Uplink only reads while your car is already awake, so there's no extra battery drain." },
];

const HISTORY_POINTS = [
  { title: "Received and installed", body: "See how long each update waited before it went in." },
  { title: "Odometer at each update", body: "Know exactly where in your car's life a version arrived." },
  { title: "Spend by month", body: "Supercharging cost and energy, with every invoice a tap away." },
  { title: "Release notes inline", body: "Open any version to read what changed." },
];

const FAQ = [
  {
    q: "Is it safe to sign in?",
    a: "You sign in on Tesla's own page. Uplink never sees your password; Tesla gives it read-only access, which you can revoke from your Tesla account at any time.",
  },
  {
    q: "Will it wake my car or drain the battery?",
    a: "No. Uplink only reads data when your car is already online, and never sends commands.",
  },
  {
    q: "What data does Uplink store?",
    a: "Your car's versions, update status, battery and odometer, and Supercharger sessions with invoices. It doesn't read your location. The privacy page lists everything.",
  },
  { q: "Does it cost anything?", a: "No." },
  { q: "Which cars work?", a: "Any Tesla on your account that Tesla's Fleet API supports, including the Model Y sold in India." },
  {
    q: "How do I delete my data?",
    a: "Use Delete my data in Settings. It removes your cars, history and charging sessions, and disconnects your Tesla account.",
  },
];

// Cached so the page stays static: the year is read through the cache, not per request.
async function Year() {
  "use cache";
  return new Date().getFullYear();
}

function SectionTitle({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h2 className="text-4xl leading-display font-semibold tracking-tight text-balance sm:text-5xl">{title}</h2>
      <p className="mt-5 text-lg text-muted-foreground">{body}</p>
    </div>
  );
}

function IconGrid({ items }: { items: { icon: LucideIcon; title: string; body: string }[] }) {
  return (
    <ul className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(({ icon: Icon, title, body }) => (
        <li key={title}>
          <h3 className="flex items-center gap-2.5 text-base font-medium">
            <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
            {title}
          </h3>
          <p className="mt-3 text-base text-muted-foreground">{body}</p>
        </li>
      ))}
    </ul>
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
          <SessionCta size="sm" dashboardOnly />
        </Suspense>
      </header>

      <section className="grid items-center gap-16 py-20 lg:grid-cols-2 lg:gap-12 lg:py-28">
        <div>
          <p className="text-xs tracking-wide text-faint uppercase">For Tesla owners in India</p>
          <h1 className="mt-5 text-4xl leading-display font-semibold tracking-tight text-balance sm:text-6xl 2xl:text-7xl">
            Know when your Tesla&apos;s next update lands.
          </h1>
          <p className="mt-6 max-w-lg text-lg text-muted-foreground">
            Uplink tracks your Tesla&apos;s software: every version, update and release note. Read-only, and it never wakes
            the car.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Suspense fallback={<SignInButton />}>
              <SessionCta />
            </Suspense>
            <a href="#features" className={buttonVariants({ variant: "outline", size: "xl" })}>
              See what it does
            </a>
          </div>
          <p className="mt-4 text-xs text-faint">Secure sign-in through Tesla.</p>
          {/* Renders nothing (and takes no space) unless sign-in failed, so the page doesn't shift. */}
          <Suspense>
            <LoginError className="mt-4" />
          </Suspense>
        </div>
        <div className="flex justify-center lg:justify-end">
          <DashboardPreview />
        </div>
      </section>

      <section id="features" className="scroll-mt-16 py-24">
        <SectionTitle
          title="Everything about your updates"
          body="One calm page for what's on your car, what's coming, and everything that came before."
        />
        <IconGrid items={FEATURES} />
      </section>

      <section className="grid items-center gap-14 py-24 lg:grid-cols-2 lg:gap-16">
        <div>
          <SectionTitle
            title="Your car's whole history"
            body="Uplink keeps a quiet record from the day you sign in: versions, dates, kilometres and charging."
          />
          <ul className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {HISTORY_POINTS.map((p) => (
              <li key={p.title}>
                <h3 className="text-base font-medium">{p.title}</h3>
                <p className="mt-2 text-base text-muted-foreground">{p.body}</p>
              </li>
            ))}
          </ul>
        </div>
        <HistoryMock />
      </section>

      <section id="faq" className="scroll-mt-16 py-24">
        <SectionTitle title="Questions" body="The short answers. The privacy page has the long ones." />
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
          Start tracking in two minutes.
        </h2>
        <Suspense fallback={<SignInButton />}>
          <SessionCta />
        </Suspense>
      </section>

      <footer className="mt-auto flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 py-8 text-xs text-faint">
        <span>
          &copy; <Year /> · Uplink is not affiliated with Tesla, Inc.
        </span>
        <nav aria-label="Legal" className="flex gap-4">
          <Link href="/privacy" className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
            Terms
          </Link>
        </nav>
      </footer>
    </div>
  );
}
