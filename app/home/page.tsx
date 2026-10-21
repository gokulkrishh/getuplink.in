import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { DashboardPreview } from "@/components/dashboard-preview";
import { LoginError } from "@/components/login-error";
import { Logo } from "@/components/logo";
import { SignInButton } from "@/components/sign-in-button";
import { buttonVariants } from "@/components/ui/button";


export const metadata: Metadata = {
  title: "Uplink",
  description: "Tesla software updates, tracked from India.",
  robots: { index: true, follow: true },
};

const FEATURES = [
  {
    title: "Every version, dated",
    body: "A history of each software version your car has run, with when each update became available and when it was installed.",
  },
  {
    title: "Release notes",
    body: "Tesla's notes for each version, one tap away.",
  },
  {
    title: "Never wakes your car",
    body: "Uplink only checks while your car is already online.",
  },
];

const STEPS = [
  {
    title: "Sign in with Tesla",
    body: "Read-only access, granted on tesla.com.",
  },
  {
    title: "Uplink checks every 6 hours",
    body: "It looks for new versions while your car is already online.",
  },
  {
    title: "See updates, notes and history",
    body: "Your dashboard shows what is available now and every version before it.",
  },
];

// Cached so the page stays static: the year is read through the cache, not per request.
async function Year() {
  "use cache";
  return new Date().getFullYear();
}

export default function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 py-8 sm:px-8">
      <header className="flex items-center justify-between gap-4 text-sm">
        <Link href="/" className="inline-flex items-center gap-2 font-medium">
          <Logo className="size-5" />
          Uplink
        </Link>
        {/* /app goes to the dashboard (app.getuplink.in, or app.localhost locally); see proxy.ts. */}
        <a href="/app" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Open app
        </a>
      </header>

      <section className="grid items-center gap-16 py-16 md:grid-cols-2 md:gap-12 md:py-24">
        <div className="max-w-md">
          <p className="text-xs tracking-wide text-faint uppercase">For Tesla owners in India</p>
          <h1 className="mt-4 text-4xl leading-display font-semibold tracking-tight text-balance sm:text-5xl">
            Know when your Tesla&apos;s next update lands.
          </h1>
          <p className="mt-5 text-base text-muted-foreground">
            Uplink tracks your Tesla&apos;s software: every version, update and release note. Read-only, and it never wakes
            the car.
          </p>
          <SignInButton className="mt-10" />
          <p className="mt-3 text-xs text-faint">Secure sign-in through Tesla.</p>
          {/* Renders nothing (and takes no space) unless sign-in failed, so the page doesn't shift. */}
          <Suspense>
            <LoginError className="mt-4" />
          </Suspense>
        </div>

        <div className="flex justify-center md:justify-end">
          <DashboardPreview />
        </div>
      </section>

      <section className="grid gap-10 border-t py-16 sm:grid-cols-3 sm:gap-8">
        {FEATURES.map((feature) => (
          <div key={feature.title}>
            <h2 className="text-sm font-medium tracking-heading">{feature.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{feature.body}</p>
          </div>
        ))}
      </section>

      <section className="border-t py-16">
        <h2 className="text-xs tracking-wide text-faint uppercase">How it works</h2>
        <ol className="mt-8 grid gap-10 sm:grid-cols-3 sm:gap-8">
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <p className="font-mono text-xs tabular-nums text-faint">{index + 1}</p>
              <h3 className="mt-2 text-sm font-medium tracking-heading">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <footer className="mt-auto flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-t pt-6 text-xs text-faint">
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
