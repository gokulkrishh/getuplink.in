import Link from "next/link";
import { Suspense } from "react";
import { DashboardPreview } from "@/components/dashboard-preview";
import { Logo } from "@/components/logo";
import { SignInButton } from "@/components/sign-in-button";
import { LoginError } from "./login-form";

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
          <h1 className="mt-4 text-4xl leading-display font-semibold tracking-tight text-balance sm:text-5xl">
            Know when your Tesla&apos;s next update lands.
          </h1>
          <p className="mt-5 text-base text-muted-foreground">
            Uplink tracks your Tesla&apos;s software: every version, update and release note. Read-only, and it never wakes
            the car.
          </p>
          <SignInButton className="mt-10" />
          <p className="mt-3 text-xs text-faint">Secure sign-in through Tesla.</p>
          {/* LoginError renders nothing (and takes no space) unless there's an error, so the page doesn't shift on load. */}
          <Suspense>
            <LoginError className="mt-4" />
          </Suspense>
        </section>

        <div className="flex justify-center md:justify-end">
          <DashboardPreview />
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
