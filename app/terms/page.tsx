import type { Metadata } from "next";
import { HOME_URL } from "@/lib/site";
import type { ReactNode } from "react";
import Link from "next/link";
import { PlainPage, PlainSection } from "@/components/plain-page";

export const metadata: Metadata = {
  title: "Terms",
  description: "The short terms for using Uplink.",
  // Indexed on getuplink.in; on the app host the X-Robots-Tag header keeps the copy there out.
  robots: { index: true, follow: true },
  alternates: { canonical: `${HOME_URL}/terms` },
};

// Checked against the law and Tesla's and Google's terms in docs/legal-review.md. Change both together.

const LINK = "underline decoration-border underline-offset-4 hover:decoration-foreground";

function Out({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className={LINK} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

const MAIL = (
  <a href="mailto:getuplink.app@gmail.com" className={LINK}>
    getuplink.app@gmail.com
  </a>
);

const SECTIONS: { title: string; body: ReactNode }[] = [
  {
    title: "Agreeing",
    body: (
      <>
        Uplink is an app run by one person in India. It's free for now, and that may change at any time. By signing in, or by ticking the box on an invite, you agree to
        these terms and to the{" "}
        <Link href="/privacy" className={LINK}>
          Privacy
        </Link>{" "}
        page.
      </>
    ),
  },
  {
    title: "Who can use it",
    body: "You must be 18 or over, and sign in only with your own Tesla account. Sign-up is by waitlist, and approval is at Uplink's discretion.",
  },
  {
    title: "Your Tesla account",
    body: "You let Uplink read your car's data through Tesla's Fleet API. You stay responsible for your car and your Tesla account, and Tesla's own terms still apply to them. If Tesla changes or stops the API, Uplink may stop working.",
  },
  {
    title: "People who drive your car",
    body: "Uplink records trips, with where the car went, whoever is driving. Tell the people who drive your car.",
  },
  {
    title: "Read-only",
    body: "Uplink only reads data. It never sends commands or controls your car, even though the key you add to your car is needed for live data.",
  },
  {
    title: "Not Tesla",
    body: "Uplink is not affiliated with, endorsed by or connected to Tesla, Inc. Tesla and model names are Tesla's trademarks.",
  },
  {
    title: "Fair use",
    body: "Don't try to break, overload or misuse the service, reach other people's data, copy or resell it, or use it to track someone without their knowledge. Only add invoices that are yours.",
  },
  {
    title: "Your connector tokens",
    body: "Keep them secret. Whoever has one can read your data, and the AI you give it to uses your data under its own terms. Remove a connector in Settings any time.",
  },
  {
    title: "Google Maps",
    body: (
      <>
        Name this place shows places from Google Maps, and a place you pick shows its Google Maps name. Their use is subject to the{" "}
        <Out href="https://maps.google.com/help/terms_maps/">Google Maps Additional Terms of Service</Out> and the{" "}
        <Out href="https://policies.google.com/privacy">Google Privacy Policy</Out>.
      </>
    ),
  },
  {
    title: "As is",
    body: "Uplink is provided as is, without warranty. Its data comes from Tesla and may be delayed, missing or wrong. Don't rely on it for safety, warranty claims or tax.",
  },
  {
    title: "Availability",
    body: "Uplink may change, pause or stop at any time. If it shuts down, it tells you in the app first and deletes your data within 30 days.",
  },
  {
    title: "Leaving and suspension",
    body: "You can stop using Uplink and delete your data at any time in Settings. Uplink can suspend or close an account that breaks these terms, or when Tesla requires it.",
  },
  {
    title: "Liability",
    body: "To the extent the law allows, Uplink isn't liable for losses from using it, except those caused by its fraud or wilful misconduct. Nothing here takes away rights the law gives you.",
  },
  {
    title: "Changes",
    body: "This page shows the date it was last updated. Big changes are shown in the app before they apply. Using Uplink after that means you accept them.",
  },
  {
    title: "Law and disputes",
    body: "The laws of India apply, and courts in India decide disputes. Write to us first, so we can try to sort it out.",
  },
  {
    title: "Contact",
    body: <>Questions or complaints about these terms: {MAIL}. Replies come within 30 days.</>,
  },
];

export default function TermsPage() {
  return (
    <PlainPage title="Terms" intro="The short terms for using Uplink." meta="Last updated 27 October 2026" current="terms">
      {SECTIONS.map((section) => (
        <PlainSection key={section.title} title={section.title}>
          <p>{section.body}</p>
        </PlainSection>
      ))}
    </PlainPage>
  );
}
