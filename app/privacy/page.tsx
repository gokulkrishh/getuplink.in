import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@/components/logo";

export const metadata: Metadata = {
  title: "Privacy · Uplink",
  description: "What Uplink stores about you and your car, and how to delete it.",
};

const STORED = [
  "Your Tesla account's sign-in tokens, encrypted",
  "Each car's VIN, name, model, colour and configuration",
  "Software version and update status",
  "Battery level, range, charge limit and charging state",
  "Odometer at each update",
  "Release notes",
  "Tesla Supercharger sessions (site, time, energy, cost) and their invoices",
];

const NOT_DONE = [
  "It doesn't read your location.",
  "It doesn't send commands to your car, and it never wakes the car.",
  "It doesn't sell or share your data.",
  "There are no ads and no tracking. One cookie keeps you signed in, a short-lived one protects the Tesla sign-in, and your theme choice is saved in your browser.",
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 py-8 sm:px-8">
      <header className="text-sm font-medium">
        <Link href="/" className="inline-flex items-center gap-2">
          <Logo className="size-5" />
          Uplink
        </Link>
      </header>

      <main className="py-16">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Privacy</h1>
        <p className="mt-2 text-sm text-faint">Last updated 21 October 2026</p>

        <div className="mt-10 grid gap-10">
          <section>
            <h2 className="text-base font-medium tracking-[-0.01em]">Who we are</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Uplink is an independent tool for Tesla owners in India to track software updates. It is not affiliated
              with Tesla.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium tracking-[-0.01em]">Signing in</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              You sign in on Tesla&apos;s own page. Uplink never sees your Tesla password.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium tracking-[-0.01em]">What Uplink stores</h2>
            <ul className="mt-2 grid gap-1 text-sm text-muted-foreground">
              {STORED.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-base font-medium tracking-[-0.01em]">What Uplink doesn&apos;t do</h2>
            <ul className="mt-2 grid gap-1 text-sm text-muted-foreground">
              {NOT_DONE.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-base font-medium tracking-[-0.01em]">Why</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              To show your versions, update status, history and charging. Nothing else.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium tracking-[-0.01em]">Where it lives</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              The database is hosted by Supabase in Mumbai (ap-south-1). The app is hosted on Vercel. Data goes to
              Tesla only to fetch your car&apos;s data.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium tracking-[-0.01em]">How long we keep it</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Until you delete it. Use Delete my data in Settings to remove your cars, history, snapshots and charging
              sessions. Use Disconnect to remove your Tesla tokens. Use Sign out everywhere to end all sessions. You
              can also revoke Uplink&apos;s access from your Tesla account.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium tracking-[-0.01em]">Your rights</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Under India&apos;s Digital Personal Data Protection Act, 2023, you can access, correct or delete your
              data. You can delete it any time with Delete my data in Settings.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium tracking-[-0.01em]">Changes</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This page shows the date it was last updated.
            </p>
          </section>
        </div>
      </main>

      <footer className="mt-auto flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-t pt-6 text-xs text-faint">
        <span>Uplink is not affiliated with Tesla, Inc.</span>
        <Link href="/terms" className="underline underline-offset-4">
          Terms
        </Link>
      </footer>
    </div>
  );
}
