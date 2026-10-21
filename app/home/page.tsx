import Link from "next/link";
import type { Metadata } from "next";
import { DashboardPreview } from "@/components/dashboard-preview";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const APP_URL = "https://app.getuplink.in";

export const metadata: Metadata = {
  title: "Uplink",
  description: "Tesla software updates, tracked from India.",
  robots: { index: true, follow: true },
};

const FEATURES = [
  {
    title: "Every version, dated",
    body: "A history of each software version your car has run, with when each update was offered and installed.",
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

// Cached so the year is fixed at build time rather than read per request.
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
        <a href={APP_URL} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Open app
        </a>
      </header>

      <section className="grid items-center gap-16 py-16 md:grid-cols-2 md:gap-12 md:py-24">
        <div className="max-w-md">
          <p className="text-xs tracking-wide text-faint uppercase">For Tesla owners in India</p>
          <h1 className="mt-4 text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-5xl">
            Know when your next update lands.
          </h1>
          <p className="mt-5 text-base text-muted-foreground">
            Uplink checks your car every few hours, keeps a history of every version it sees, and shows Tesla&apos;s
            release notes. It is read-only and never wakes the car.
          </p>
          <a href={APP_URL} className={cn(buttonVariants({ size: "lg" }), "mt-10 h-11 px-5")}>
            Open Uplink
          </a>
        </div>

        <div className="flex justify-center md:justify-end">
          <DashboardPreview />
        </div>
      </section>

      <section className="grid gap-10 border-t py-16 sm:grid-cols-3 sm:gap-8">
        {FEATURES.map((feature) => (
          <div key={feature.title}>
            <h2 className="text-sm font-medium tracking-[-0.01em]">{feature.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{feature.body}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 border-t py-16 md:grid-cols-[minmax(0,1fr)_2fr] md:gap-12">
        <p className="text-xs tracking-wide text-faint uppercase">How it works</p>
        <ol className="grid gap-8 sm:grid-cols-3 sm:gap-8">
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <p className="font-mono text-xs tabular-nums text-faint">{index + 1}</p>
              <h2 className="mt-2 text-sm font-medium tracking-[-0.01em]">{step.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <footer className="mt-auto flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-t pt-6 text-xs text-faint">
        <span>Uplink is not affiliated with Tesla, Inc.</span>
        <span>
          &copy; <Year />
        </span>
      </footer>
    </div>
  );
}
