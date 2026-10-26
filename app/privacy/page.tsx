import type { Metadata } from "next";
import { PLAIN_LIST, PlainPage, PlainSection } from "@/components/plain-page";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Uplink stores about you and your car, and how to delete it.",
};

const STORED = [
  "Your Tesla account's sign-in tokens, encrypted",
  "Each car's VIN, name, model, colour and configuration",
  "Software version and update status",
  "Whether Tesla shows an unpaid Supercharger balance or the car at a service centre",
  "Battery level, range, charge limit, charging state and battery temperature",
  "Odometer at each update",
  "Everything your car streams while it's awake: driving (speed, gear, pedals, acceleration), battery and charging, climate and cabin, tyres, doors and locks, Sentry Mode and navigation. Not what's playing, and not your phone's name",
  "Where the car is while it's awake, including trip routes, stops and navigation destinations",
  "Release notes",
  "Tesla Supercharger sessions (site, time, energy, cost and each fee on the bill) and their invoices",
  "Each car's home state, such as Karnataka, for the India rollout map",
  "The name of the charging station each session happened at, such as Statiq, Koramangala",
];

const NOT_DONE = [
  "It doesn't send commands to your car, and it never wakes the car. The key you add to your car can't unlock or drive it.",
  "It doesn't sell or share your data.",
  "There are no ads and no tracking. One cookie keeps you signed in, a short-lived one protects the Tesla sign-in, and your theme choice is saved in your browser.",
];


export default function PrivacyPage() {
  return (
    <PlainPage
      title="Privacy"
      intro="What Uplink stores about you and your car, and how to delete it."
      meta="Last updated 26 October 2026"
      current="privacy"
    >
      <PlainSection title="Who we are">
        <p>
          Uplink is an independent tool for Tesla owners in India to track software updates. It is not affiliated
          with Tesla.
        </p>
      </PlainSection>

      <PlainSection title="Signing in">
        <p>
          You sign in on Tesla&apos;s own page. Uplink never sees your Tesla password.
        </p>
        <p>
          On the waitlist, Uplink keeps only your Tesla account id and when you asked. No sign-in tokens, no email
          and nothing about your car until you&apos;re approved and sign in again.
        </p>
      </PlainSection>

      <PlainSection title="What Uplink stores">
        <ul className={PLAIN_LIST}>
          {STORED.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </PlainSection>

      <PlainSection title="What Uplink doesn't do">
        <ul className={PLAIN_LIST}>
          {NOT_DONE.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </PlainSection>

      <PlainSection title="Why">
        <p>
          To show your versions, update status, history, charging and energy use, and which states each update has reached. Nothing else.
        </p>
      </PlainSection>

      <PlainSection title="How data arrives">
        <p>Two ways.</p>
        <ul className={PLAIN_LIST}>
          <li>
            Uplink checks Tesla&apos;s Fleet API about every 6 hours, less often when it nears its monthly Tesla
            budget, and while a charge is in progress, once more to name the station. It only reads a car that
            is already online.
          </li>
          <li>
            Once you add Uplink&apos;s key to your car, the car streams changes to Uplink while it&apos;s awake:
            every field Tesla&apos;s Fleet Telemetry offers for your car.
          </li>
          <li>That includes the car&apos;s location, so trips can show where you went. Delete my data in Settings removes it.</li>
        </ul>
      </PlainSection>

      <PlainSection title="Uplink's key">
        <p>
          The key lets your car send data to Uplink. It can&apos;t unlock or drive the car, and Uplink never sends
          commands. Remove it any time in your car&apos;s Locks settings.
        </p>
      </PlainSection>

      <PlainSection title="Where it lives">
        <ul className={PLAIN_LIST}>
          <li>Streamed data goes to Uplink&apos;s receiver on Fly.io in Singapore.</li>
          <li>The database is hosted by Supabase in Mumbai (ap-south-1).</li>
          <li>The app is hosted on Vercel.</li>
          <li>Data goes to Tesla only to fetch your car&apos;s data.</li>
        </ul>
      </PlainSection>

      <PlainSection title="How long we keep it">
        <p>Until you delete it, except streamed readings.</p>
        <ul className={PLAIN_LIST}>
          <li>
            Streamed readings are kept as long as a page shows them: charging, charge level, odometer and software
            updates for good; trip routes, speed and location for 120 days; the rest for 7 to 14 days. The
            latest reading of each kind is always kept, so the car page can show it.
          </li>
          <li>Where the car was at the start of each charge is kept with that charge, for the charging map.</li>
          <li>
            Delete my data in Settings removes your cars, history, snapshots, streamed readings and charging
            sessions. It also stops your car streaming to Uplink; then remove the key in your car&apos;s Locks
            settings.
          </li>
          <li>Disconnect removes your Tesla tokens.</li>
          <li>Sign out everywhere ends all sessions.</li>
          <li>You can also revoke Uplink&apos;s access from your Tesla account.</li>
        </ul>
      </PlainSection>

      <PlainSection title="Your rights">
        <p>
          Under India&apos;s Digital Personal Data Protection Act, 2023, you can access, correct or delete your
          data. You can delete it any time with Delete my data in Settings.
        </p>
      </PlainSection>

      <PlainSection title="Contact">
        <p>
          Questions, requests or complaints about your data: <a href="mailto:getuplink.app@gmail.com" className="underline decoration-border underline-offset-4 hover:decoration-foreground">getuplink.app@gmail.com</a>.
        </p>
      </PlainSection>

      <PlainSection title="Changes">
        <p>
          This page shows the date it was last updated.
        </p>
      </PlainSection>
    </PlainPage>
  );
}
