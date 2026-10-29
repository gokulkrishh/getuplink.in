import { LINK } from "@/lib/link-style";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { HOME_URL } from "@/lib/site";
import { CONTACT_EMAIL, PLAIN_LIST, PlainPage } from "@/components/plain-page";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Uplink keeps about your car and the services it uses.",
  // Indexed on getuplink.in; on the app host the X-Robots-Tag header keeps the copy there out.
  robots: { index: true, follow: true },
  alternates: { canonical: `${HOME_URL}/privacy` },
};

// docs/legal-review.md lists what the law asks of this page. docs/later.md has the items still to add.


const SERVICES: ReactNode[] = [
  "Tesla, for your car's data",
  "Supabase, to store it (Mumbai)",
  "Vercel, to run the website (Mumbai)",
  "Fly.io, to receive your car's live data (Singapore)",
  "OpenRouter and Anthropic, to write tips and drive summaries and to decide when to suggest sharing, from your figures only, never your location or VIN",
  "OpenStreetMap and Google, for place names",
  "CARTO, for map tiles",
];

// One topic per section, a ruled heading and a few short lines, like a note rather than a contract.
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="border-b pb-2 text-lg font-medium tracking-heading">{title}</h2>
      <div className="space-y-3 text-base leading-relaxed text-foreground">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <PlainPage title="Privacy" intro="What Uplink keeps about you and your car, and why." meta="Last updated 29 October 2026" current="privacy">
      <Section title="What we collect">
        <p>
          Your Tesla account id, but not your name or email. Your car&apos;s details and the data it sends: battery, charging, drives
          and where the car goes. Your charges and invoices, the places you name, and any feedback you send.
        </p>
      </Section>
      <Section title="Your car and Uplink's key">
        <p>
          Uplink only reads. It never unlocks, drives or sends commands to your car, and it never wakes it. You can remove its key
          any time in the car&apos;s Controls, then Locks.
        </p>
      </Section>
      <Section title="How we use your data">
        <p>Only to show you your car in Uplink. It isn&apos;t sold or used for ads. If you choose to share, other owners see only combined figures.</p>
        <p>These services help run Uplink:</p>
        <ul className={PLAIN_LIST}>
          {SERVICES.map((service, i) => (
            <li key={i}>{service}</li>
          ))}
        </ul>
      </Section>
      <Section title="Cookies">
        <p>One cookie keeps you signed in, short-lived ones help you sign in, and one remembers light or dark. No tracking or analytics cookies.</p>
      </Section>
      <Section title="Deleting your data">
        <p>Delete my data in Settings removes your car&apos;s data. Delete account removes everything. Both are permanent.</p>
      </Section>
      <Section title="Contact">
        <p>
          <a href={`mailto:${CONTACT_EMAIL}`} className={LINK}>
            {CONTACT_EMAIL}
          </a>
        </p>
      </Section>
    </PlainPage>
  );
}
