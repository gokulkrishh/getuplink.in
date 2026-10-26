import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PLAIN_LIST, PlainPage, PlainSection } from "@/components/plain-page";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Uplink stores about you and your car, who else gets it, and how to delete it.",
};

// What this page says is checked against the code and the law in docs/legal-review.md. Change both together.

const EMAIL = "getuplink.app@gmail.com";
const LINK = "underline decoration-border underline-offset-4 hover:decoration-foreground";

function Mail() {
  return (
    <a href={`mailto:${EMAIL}`} className={LINK}>
      {EMAIL}
    </a>
  );
}

function Out({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className={LINK} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

const STORED = [
  "Your Tesla account id and when you first signed in",
  "Your Tesla account's sign-in tokens, encrypted",
  "Each car's VIN, name, model, colour and configuration",
  "Software version and update status",
  "Whether Tesla shows an unpaid Supercharger balance or the car at a service centre",
  "Battery level, range, charge limit, charging state and battery temperature",
  "Odometer at each update",
  "Everything your car streams while it's awake: driving (speed, gear, pedals, acceleration), battery and charging, climate and cabin, tyres, doors and locks, Sentry Mode and navigation. Not what's playing, and not your phone's name",
  "Where the car is while it's awake, including trip routes, stops and navigation destinations",
  "Tesla Supercharger sessions: site, time, energy, cost and each fee on the bill. The invoice itself is fetched from Tesla when you open it, not stored",
  "Invoices from other charging networks that you add through the connector: the network, station, times, energy, amount, GST, invoice number, the email's message id if it came from email and, if you send it, the file",
  "Names you give places, with the spot and its radius. For a place you pick from Google Maps, only Google's ID for it",
  "Each car's home state, such as Karnataka, for the India rollout map",
  "The name of the charging station each session happened at, such as Statiq, Koramangala",
  "A log of each check of your car, and how many Tesla API calls your account made",
  "Your connector token, stored only as a hash, and when it was last used",
];

const NOT_DONE = [
  "It doesn't send commands to your car, and it never wakes the car. The key you add to your car can't unlock or drive it.",
  "It doesn't sell your data, and shares it only as listed under Who else gets it.",
  "There are no ads and no tracking. One cookie keeps you signed in, a short-lived one protects the Tesla sign-in, and your theme choice is saved in your browser.",
];

export default function PrivacyPage() {
  return (
    <PlainPage
      title="Privacy"
      intro="What Uplink stores about you and your car, who else gets it, and how to delete it."
      meta="Last updated 26 October 2026"
      current="privacy"
    >
      <PlainSection title="Who we are">
        <p>
          Uplink is a free, independent tool for Tesla owners in India, run by one person in India. It is not affiliated
          with Tesla. It decides what is stored and why, so it is responsible for your data.
        </p>
        <p>
          Uplink follows India&apos;s Digital Personal Data Protection Act, 2023, the DPDP Rules, 2025 and the IT Act&apos;s
          rules on personal data.
        </p>
      </PlainSection>

      <PlainSection title="Signing in">
        <p>You sign in on Tesla&apos;s own page. Uplink never sees your Tesla password.</p>
        <p>Tesla&apos;s page asks you to allow:</p>
        <ul className={PLAIN_LIST}>
          <li>Profile information. Uplink keeps only your Tesla account id from it, not your name or email.</li>
          <li>Vehicle information, for everything on your car&apos;s pages.</li>
          <li>Vehicle location, for trip routes, the charging map and your home state.</li>
          <li>
            Charging management. Uplink uses it only to read your Supercharger history and invoices. It never starts or
            stops a charge.
          </li>
        </ul>
        <p>
          You can leave Vehicle location unticked. Tesla then sends no location: trips show no route, and there&apos;s no
          charging map.
        </p>
        <p>
          On the waitlist, Uplink keeps only your Tesla account id and when you asked. No sign-in tokens, no email and
          nothing about your car until you&apos;re approved and sign in again.
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
          To show your versions, update status, history, trips, charging and energy use, and which states each update has
          reached. To answer the AI you connect, if you connect one. To keep Uplink within its Tesla budget. Nothing else.
        </p>
      </PlainSection>

      <PlainSection title="How data arrives">
        <p>Two ways.</p>
        <ul className={PLAIN_LIST}>
          <li>
            Uplink checks Tesla&apos;s Fleet API about every 6 hours, less often when it nears its monthly Tesla budget,
            and while a charge is in progress, once more to name the station. It only reads a car that is already online.
            The location it reads then is used to find the state and the station, and isn&apos;t stored.
          </li>
          <li>
            Once you add Uplink&apos;s key to your car, the car streams changes to Uplink while it&apos;s awake: every
            field Tesla&apos;s Fleet Telemetry offers for your car, including its location.
          </li>
        </ul>
      </PlainSection>

      <PlainSection title="Uplink's key">
        <p>
          The key lets your car send data to Uplink. It can&apos;t unlock or drive the car, and Uplink never sends
          commands. Remove it any time in your car&apos;s Locks settings.
        </p>
      </PlainSection>

      <PlainSection title="Who else gets it">
        <ul className={PLAIN_LIST}>
          <li>Supabase stores the database and invoice files in Mumbai.</li>
          <li>Vercel hosts the app. Its servers for Uplink run in Mumbai, and pages are served from Vercel&apos;s worldwide network.</li>
          <li>Fly.io runs the receiver your car streams to, in Singapore. It passes readings on to the database.</li>
          <li>
            Tesla, which Uplink asks for your car&apos;s data. Tesla may use what Uplink sends it under{" "}
            <Out href="https://www.tesla.com/legal/privacy">Tesla&apos;s Privacy Notice</Out>.
          </li>
          <li>
            Google Maps, when you open Name this place: the spot&apos;s coordinates, to suggest nearby places and the street
            address. If you pick one, Uplink keeps only its ID and asks Google for the name each time a page shows it.{" "}
            <Out href="https://policies.google.com/privacy">Google&apos;s Privacy Policy</Out> applies.
          </li>
          <li>OpenStreetMap&apos;s Nominatim: a spot&apos;s coordinates, with nothing about you, to look up the area name.</li>
          <li>CARTO serves the map tiles to your browser, so it sees your IP address and the part of the map you view.</li>
          <li>
            The AI you connect, if you make a connector token. It reads your data under its own terms. Revoke the token in
            Settings to stop it.
          </li>
          <li>
            Another Uplink user who has your car on their Tesla account sees its data from when they added it, not before.
          </li>
          <li>
            Signed-in owners see rollout totals: how many cars run each version, by state. No names or VINs.
          </li>
          <li>Authorities, only when Indian law requires it.</li>
        </ul>
        <p>
          Vercel, Supabase and Fly.io are US companies. The receiver, and some of these services, handle data outside
          India.
        </p>
        <p>
          Uplink&apos;s operator can reach the database to run and fix Uplink, and sees the waitlist (account numbers and
          dates) and API costs.
        </p>
      </PlainSection>

      <PlainSection title="How long we keep it">
        <p>Until you delete it, except these.</p>
        <ul className={PLAIN_LIST}>
          <li>
            Streamed readings are kept as long as a page shows them: charging, battery, odometer, lifetime counters and
            software updates for good; trip routes, speed and location for 120 days; a few cabin, battery and tyre readings
            for 14 to 22 days; the rest for 7 days. The latest reading of each kind is always kept, so the car page can
            show it.
          </li>
          <li>Where the car was at the start of each charge is kept with that charge, for the charging map.</li>
          <li>Area names, such as Koramangala, are kept by rounded spot, with nothing about who parked there.</li>
          <li>If a law makes Uplink keep something longer, it keeps only that, only as long as required.</li>
        </ul>
      </PlainSection>

      <PlainSection title="Deleting your data">
        <ul className={PLAIN_LIST}>
          <li>
            Delete my data in Settings removes your cars, history, snapshots, streamed readings, charging sessions,
            invoices, places, check logs, connector token and Tesla tokens. It stops your car streaming to Uplink, unless
            another Uplink user tracks it. Your account id and Tesla API call counts stay, so you can sign in again.
          </li>
          <li>
            Delete account does the same, then removes your account. Your Tesla API call counts stay in Uplink&apos;s
            monthly totals, without your account.
          </li>
          <li>
            On a car another Uplink user also tracks, the readings from their time with it stay theirs.
          </li>
          <li>After either, remove Uplink&apos;s key in your car&apos;s Locks settings.</li>
        </ul>
      </PlainSection>

      <PlainSection title="Withdrawing consent">
        <p>Any time, as easily as you signed in:</p>
        <ul className={PLAIN_LIST}>
          <li>
            Disconnect in Settings removes your Tesla tokens, so Uplink stops reading your car. It stops your car
            streaming too, unless another Uplink user tracks it. Your history stays.
          </li>
          <li>Revoke Uplink&apos;s access from your Tesla account, and Uplink can no longer read your car.</li>
          <li>Revoke only its location access there, and Tesla stops sending where the car is.</li>
          <li>Delete my data or Delete account in Settings stops the reading and deletes what was read.</li>
          <li>To leave the waitlist, email us the date you asked.</li>
        </ul>
        <p>What Uplink read before you withdrew stays lawful.</p>
      </PlainSection>

      <PlainSection title="Your rights">
        <p>You can:</p>
        <ul className={PLAIN_LIST}>
          <li>See your data. The app shows it, and on request we send a summary and who it was shared with.</li>
          <li>Correct or complete it.</li>
          <li>Delete it, in Settings or by asking us.</li>
          <li>Name someone to use these rights for you if you die or can&apos;t act yourself.</li>
          <li>Complain to us, and then to the Data Protection Board of India if you&apos;re not satisfied.</li>
        </ul>
        <p>
          Email <Mail /> with your request and your car&apos;s VIN, so we can find your account. We may ask you to show the
          car is yours. We confirm within 2 days and answer within 30 days.
        </p>
      </PlainSection>

      <PlainSection title="Grievance Officer">
        <p>
          Questions, requests or complaints about your data go to Uplink&apos;s Grievance Officer at <Mail />. Replies come
          within 30 days.
        </p>
      </PlainSection>

      <PlainSection title="Security">
        <p>
          Tesla tokens are encrypted. The connector token is stored only as a hash. Data travels over TLS, and your
          car&apos;s stream uses mutual TLS. Only Uplink&apos;s servers can read the database.
        </p>
      </PlainSection>

      <PlainSection title="If there's a breach">
        <p>
          If your data is exposed, Uplink tells you in the app without delay: what happened, what it means for you, what
          is being done and what you can do. It also reports it to the Data Protection Board and to Tesla.
        </p>
      </PlainSection>

      <PlainSection title="Age">
        <p>Uplink is for adults. Don&apos;t sign in if you&apos;re under 18. An account found to be a child&apos;s is deleted.</p>
      </PlainSection>

      <PlainSection title="Changes">
        <p>
          This page shows the date it was last updated. If Uplink starts collecting more, or using it for something new,
          it asks you first.
        </p>
      </PlainSection>
    </PlainPage>
  );
}
