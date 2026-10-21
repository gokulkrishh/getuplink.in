import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@/components/logo";

// TODO(owner): confirm this address exists before sign-ups open.
const CONTACT = "privacy@getuplink.in";

export const metadata: Metadata = {
  title: "Terms · Uplink",
  description: "The short terms for using Uplink.",
};

const SECTIONS = [
  {
    title: "As is",
    body: "Uplink is free and provided as is, without warranty. Its data comes from Tesla and may be delayed or wrong.",
  },
  {
    title: "Not Tesla",
    body: "Uplink is not affiliated with, endorsed by or connected to Tesla, Inc. Tesla and model names are Tesla's trademarks.",
  },
  {
    title: "Read-only",
    body: "Uplink only reads data. It never controls your car. You are responsible for your car and your Tesla account.",
  },
  {
    title: "Fair use",
    body: "Don't try to break, overload or misuse the service. Access can be stopped for misuse.",
  },
  {
    title: "Leaving",
    body: "You can stop using Uplink and delete your data at any time with Delete my data in Settings.",
  },
  {
    title: "Liability",
    body: "To the extent the law allows, Uplink isn't liable for losses from using it.",
  },
  {
    title: "Governing law",
    body: "The laws of India apply.",
  },
];

export default function TermsPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 py-8 sm:px-8">
      <header className="text-sm font-medium">
        <Link href="/" className="inline-flex items-center gap-2">
          <Logo className="size-5" />
          Uplink
        </Link>
      </header>

      <main className="py-16">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Terms</h1>
        <p className="mt-2 text-sm text-faint">Last updated 21 October 2026</p>

        <div className="mt-10 grid gap-10">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="text-base font-medium tracking-[-0.01em]">{section.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{section.body}</p>
            </section>
          ))}

          <section>
            <h2 className="text-base font-medium tracking-[-0.01em]">Contact</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Email{" "}
              <a href={`mailto:${CONTACT}`} className="text-foreground underline underline-offset-4">
                {CONTACT}
              </a>
              .
            </p>
          </section>
        </div>
      </main>

      <footer className="mt-auto flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-t pt-6 text-xs text-faint">
        <span>Uplink is not affiliated with Tesla, Inc.</span>
        <Link href="/privacy" className="underline underline-offset-4">
          Privacy
        </Link>
      </footer>
    </div>
  );
}
