import type { Metadata } from "next";
import { io } from "next/cache";
import { after } from "next/server";
import { Suspense } from "react";
import { PlainPage } from "@/components/plain-page";
import { StatusBars } from "@/components/status-bars";
import { formatClock, formatDateTime, formatDuration, formatShortDate } from "@/lib/format";
import { loadStatus, recordIfStale, type ComponentStatus } from "@/lib/server/status";
import { OPEN_GRAPH, STATUS_URL, TWITTER } from "@/lib/site";
import { componentLabel, type Incident, istDay, overallHeadline, STATUS_WORD, type Status } from "@/lib/status";

const DESCRIPTION = "Whether Uplink's website, database and live car data are working.";

// Served at status.getuplink.in/ (proxy.ts rewrites it to /status), so its links and preview image use that host.
// Kept out of search, as the X-Robots-Tag header on that host already says; link previews still work.
export const metadata: Metadata = {
  metadataBase: new URL(STATUS_URL),
  title: "Status",
  description: DESCRIPTION,
  robots: { index: false, follow: false },
  openGraph: { ...OPEN_GRAPH, url: "/", title: "Uplink status", description: DESCRIPTION },
  twitter: { ...TWITTER, title: "Uplink status", description: DESCRIPTION },
};

const DOT: Record<Status, string> = {
  operational: "bg-positive",
  degraded: "bg-warning",
  down: "bg-destructive",
};

// Operational is green, down is red, having problems is amber between them, and no data is a faint bar.
const BAR: Record<Status | "none", string> = { ...DOT, none: "bg-muted" };

const dayLabel = (day: string) => formatShortDate(`${day}T00:00:00+05:30`);

function Component({ item }: { item: ComponentStatus }) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-medium tracking-heading">{componentLabel(item.name)}</h2>
        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <span aria-hidden="true" className={`size-2 rounded-full ${item.current ? DOT[item.current] : "bg-muted"}`} />
          {item.current ? STATUS_WORD[item.current] : "Not checked yet"}
        </span>
      </div>
      <StatusBars
        label={`${componentLabel(item.name)}, last ${item.bars.length} days`}
        bars={item.bars.map((bar) => ({
          day: bar.day,
          label: dayLabel(bar.day),
          words: bar.status ? STATUS_WORD[bar.status] : "No checks",
          className: BAR[bar.status ?? "none"],
        }))}
      />
      <div className="mt-2 flex justify-between text-xs text-faint">
        <span>{item.bars.length} days ago</span>
        <span>{uptimeLine(item)}</span>
        <span>Today</span>
      </div>
    </section>
  );
}

// "100% uptime", and the days with problems beside it: they count as up, so without the count a row of amber
// days would sit next to 100% with nothing to explain it.
function uptimeLine(item: ComponentStatus): string {
  if (item.uptime === null) return "No uptime yet";
  const slow = item.bars.filter((bar) => bar.status === "degraded").length;
  return slow === 0 ? `${item.uptime}% uptime` : `${item.uptime}% uptime · ${slow} ${slow === 1 ? "day" : "days"} with problems`;
}

// "26 Oct, 3:38 AM to 27 Oct, 4:13 PM", or "26 Oct, 3:38 AM" for one check.
function span(i: Incident): string {
  const at = (iso: string) => `${formatShortDate(iso)}, ${formatClock(iso)}`;
  return i.from === i.to ? at(i.from) : `${at(i.from)} to ${istDay(Date.parse(i.from)) === istDay(Date.parse(i.to)) ? formatClock(i.to) : at(i.to)}`;
}

// The latest issues, newest first: which part, and when and for how long. What the checks found is never shown
// here: it can hold Tesla's error text, VINs included. Checks before 27 Oct kept no reason and aren't read.
function PastIssues({ list }: { list: Incident[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium tracking-heading">Latest issues</h2>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">No issues recorded.</p>
      ) : (
        <ol className="divide-y border-y">
          {list.map((i) => (
            <li key={`${i.component}:${i.from}`} className="space-y-1 py-3 text-sm">
              <p className="flex flex-wrap items-center gap-x-2">
                <span aria-hidden="true" className={`size-2 rounded-full ${DOT[i.status]}`} />
                <span className="font-medium">{componentLabel(i.component)}</span>
                <span className="text-muted-foreground">· {STATUS_WORD[i.status]}</span>
              </p>
              <p className="text-muted-foreground tabular-nums">
                {span(i)}
                {i.from !== i.to && ` · ${formatDuration((Date.parse(i.to) - Date.parse(i.from)) / 1000)}`}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

async function Components() {
  const { components, checkedAt, incidents } = await loadStatus();
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
      <PastIssues list={incidents} />
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
