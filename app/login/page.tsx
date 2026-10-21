import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { SignInButton } from "@/components/sign-in-button";
import { LoginError } from "./login-form";

// Static illustration of the dashboard, so the sign-in page shows what you get.
function Preview() {
  return (
    <div aria-hidden="true" className="w-full max-w-sm border p-6 text-left select-none sm:p-8">
      <p className="text-xs text-faint">Model Y</p>
      <p className="mt-1 font-mono text-4xl font-medium tracking-tight tabular-nums">2026.32.3</p>
      <div className="mt-8 flex items-baseline justify-between text-sm">
        <span>
          Downloading <span className="ml-1 font-mono text-muted-foreground">2026.38.3</span>
        </span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">42%</span>
      </div>
      <div className="mt-2 h-px bg-border">
        <div className="h-px w-[42%] bg-foreground" />
      </div>
      <svg viewBox="0 0 300 48" className="mt-8 h-12 w-full text-foreground" preserveAspectRatio="none">
        <path d="M0 44H70V34H150V22H232V10H300" fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-3 flex justify-between text-xs text-faint">
        <span>Jul</span>
        <span>Aug</span>
        <span>Sep</span>
        <span>Oct</span>
      </div>
      <p className="mt-8 border-t pt-4 text-xs text-muted-foreground">Last seen 9:15 AM IST</p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 py-8 sm:px-8">
      <header className="text-sm font-medium">
        <Link href="/" className="inline-flex items-center gap-2">
          <Logo className="size-5" />
          Uplink
        </Link>
      </header>

      <div className="grid flex-1 items-center gap-16 py-16 md:grid-cols-2 md:gap-12">
        <section className="max-w-md">
          <p className="text-xs tracking-wide text-faint uppercase">For Tesla owners in India</p>
          <h1 className="mt-4 text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-5xl">
            Know when your next update lands.
          </h1>
          <p className="mt-5 text-base text-muted-foreground">
            Uplink checks your car every few hours and keeps a quiet history of every version it sees. Read-only, and it
            never wakes the car.
          </p>
          <SignInButton className="mt-10" />
          <p className="mt-3 text-xs text-faint">You&apos;ll sign in on tesla.com. Uplink never sees your password.</p>
          {/* LoginError renders nothing (and takes no space) unless there's an error, so the page doesn't shift on load. */}
          <Suspense>
            <LoginError className="mt-4" />
          </Suspense>
        </section>

        <div className="flex justify-center md:justify-end">
          <Preview />
        </div>
      </div>

      <footer className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-faint">
        <span>Read-only access</span>
        <span>Never wakes your car</span>
        <span>Times in IST</span>
      </footer>
    </div>
  );
}
