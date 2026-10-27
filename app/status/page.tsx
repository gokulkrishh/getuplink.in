import type { Metadata } from "next";
import { io } from "next/cache";
import { after } from "next/server";
import { Suspense } from "react";
import { PlainPage } from "@/components/plain-page";
import { formatDateTime, formatShortDate } from "@/lib/format";
import { loadStatus, recordIfStale, type ComponentStatus } from "@/lib/server/status";
import { OPEN_GRAPH, STATUS_URL, TWITTER } from "@/lib/site";
import { componentLabel, overallHeadline, STATUS_WORD, type Status } from "@/lib/status";

const DESCRIPTION = "Whether Uplink's website, database and live car data are working.";

// Served at status.getuplink.in/ (proxy.ts rewrites it to /status), so its links and preview image use that host.
export const metadata: Metadata = {
  metadataBase: new URL(STATUS_URL),
  title: "Status",
  description: DESCRIPTION,
  robots: { index: true, follow: true },
  openGraph: { ...OPEN_GRAPH, url: "/", title: "Uplink status", description: DESCRIPTION },
  twitter: { ...TWITTER, title: "Uplink status", description: DESCRIPTION },
};

const DOT: Record<Status, string> = {
  operational: "bg-positive",
  degraded: "bg-muted-foreground",
  down: "bg-destructive",
};

// Operational is green, down is red, degraded sits between in grey, and no data is a faint bar.
const BAR: Record<Status | "none", string> = { ...DOT, none: "bg-muted" };

function barTitle(day: string, status: Status | null): string {
  return `${formatShortDate(`${day}T00:00:00+05:30`)}: ${status ? STATUS_WORD[status] : "No data"}`;
}

function Component({ item }: { item: ComponentStatus }) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-medium tracking-heading">{componentLabel(item.name)}</h2>
        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <span aria-hidden="true" className={`size-2 ${item.current ? DOT[item.current] : "bg-muted"}`} />
          {item.current ? STATUS_WORD[item.current] : "Not checked yet"}
        </span>
      </div>
      <div className="mt-3 flex h-8 gap-px" role="img" aria-label={`${componentLabel(item.name)}, last ${item.bars.length} days`}>
        {item.bars.map((bar) => (
          <div key={bar.day} title={barTitle(bar.day, bar.status)} className={`flex-1 ${BAR[bar.status ?? "none"]}`} />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-faint">
        <span>{item.bars.length} days ago</span>
        <span>{item.uptime === null ? "No uptime yet" : `${item.uptime}% uptime`}</span>
        <span>Today</span>
      </div>
    </section>
  );
}

async function Components() {
  const { components, checkedAt } = await loadStatus();
  const headline = overallHeadline(components.map((c) => c.current));
  return (
    <>
      <p className="flex items-center gap-2 text-base">
        {headline && <span aria-hidden="true" className={`size-2.5 ${DOT[headline.status]}`} />}
        {headline ? headline.text : "No checks yet"}
      </p>
      {components.map((item) => (
        <Component key={item.name} item={item} />
      ))}
      {checkedAt && <p className="text-sm text-muted-foreground">Last checked {formatDateTime(checkedAt)}</p>}
    </>
  );
}

// Runs a check after the response is sent when the newest one is over 5 minutes old. It reads the clock,
// so it waits for a real request and stays out of the prerendered page.
async function RecordHealth() {
  await io();
  after(recordIfStale);
  return null;
}

export default function StatusPage() {
  return (
    <PlainPage
      title="Uplink status"
      intro="Whether Uplink's website, database and live car data are working."
      current="status"
      home="/home"
      wide
    >
      <Suspense fallback={<p className="text-base text-muted-foreground">Checking…</p>}>
        <Components />
      </Suspense>
      <Suspense>
        <RecordHealth />
      </Suspense>
    </PlainPage>
  );
}
