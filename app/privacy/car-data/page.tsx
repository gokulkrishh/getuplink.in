import type { Metadata } from "next";
import { HOME_URL } from "@/lib/site";
import Link from "next/link";
import { PLAIN_LIST, PlainPage, PlainSection } from "@/components/plain-page";
import { CAR_DATA_GROUPS, groupKeep, keepWords } from "@/lib/car-data";
import { keepDays } from "@/lib/telemetry-retention";

export const metadata: Metadata = {
  title: "Car data we store",
  description: "Every figure from your Tesla that Uplink stores, and how long each is kept.",
  // Indexed on getuplink.in; on the app host the X-Robots-Tag header keeps the copy there out.
  robots: { index: true, follow: true },
  alternates: { canonical: `${HOME_URL}/privacy/car-data` },
};

const LINK = "underline decoration-border underline-offset-4 hover:decoration-foreground";

// The list and the keep times come from lib/car-data.ts, which test/car-data.test.ts holds to what Uplink
// actually asks the car for. Wording changes here go in docs/legal-review.md too.
export default function CarDataPage() {
  return (
    <PlainPage
      title="Car data we store"
      intro="Every figure from your Tesla that Uplink stores, and how long each is kept."
      meta="Last updated 27 October 2026"
    >
      <PlainSection title="How long">
        <p>
          Your car sends these while it&apos;s awake, when they change. The latest figure of each kind is always kept, so
          your car&apos;s page can show it. Older figures go after the time shown, and everything goes when you delete
          your data. The rest of what Uplink stores is on the{" "}
          <Link href="/privacy" className={LINK}>
            Privacy
          </Link>{" "}
          page.
        </p>
      </PlainSection>

      {CAR_DATA_GROUPS.map((group) => (
        <PlainSection key={group.title} title={group.title}>
          <p>{group.what}</p>
          <p className="text-sm text-muted-foreground">Kept {keepWords(groupKeep(group))}.</p>
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Tesla&apos;s names for these ({group.fields.length})</summary>
            <ul className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {group.fields.map((field) => {
                const days = keepDays(field);
                return (
                  <li key={field} className="flex justify-between gap-3">
                    <span className="min-w-0 break-all font-mono text-xs leading-5">{field}</span>
                    <span className="shrink-0 text-xs leading-5 text-faint">{days === null ? "For good" : `${days} days`}</span>
                  </li>
                );
              })}
            </ul>
          </details>
        </PlainSection>
      ))}

      <PlainSection title="Where you charge">
        <p>Where the car was at the start of each charge is kept with that charge, for the charging map.</p>
      </PlainSection>
    </PlainPage>
  );
}
