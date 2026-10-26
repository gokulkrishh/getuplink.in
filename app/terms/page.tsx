import type { Metadata } from "next";
import { PlainPage, PlainSection } from "@/components/plain-page";

export const metadata: Metadata = {
  title: "Terms",
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
    body: "Uplink only reads data. It never sends commands or controls your car, even though the key you add to your car is needed for live data. You are responsible for your car and your Tesla account.",
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
  {
    title: "Contact",
    body: "Questions about these terms: getuplink.app@gmail.com.",
  },
];

export default function TermsPage() {
  return (
    <PlainPage title="Terms" intro="The short terms for using Uplink." meta="Last updated 26 October 2026" current="terms">
      {SECTIONS.map((section) => (
        <PlainSection key={section.title} title={section.title}>
          <p>{section.body}</p>
        </PlainSection>
      ))}
    </PlainPage>
  );
}
