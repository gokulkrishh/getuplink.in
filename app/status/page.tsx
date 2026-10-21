import Link from "next/link";
import type { Metadata } from "next";
import { io } from "next/cache";
import { after } from "next/server";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { formatDateTime, formatShortDate } from "@/lib/format";
import { loadStatus, recordIfStale, type ComponentStatus } from "@/lib/server/status";
import { overallHeadline, STATUS_WORD, type Status } from "@/lib/status";

export const metadata: Metadata = {
  title: "Status · Uplink",
  description: "Whether Uplink's website, database and live car data are working.",
  robots: { index: true, follow: true },
};

const DOT: Record<Status, string> = {
  operational: "bg-positive",
  degraded: "bg-muted-foreground",
  down: "bg-destructive",
};

// Operational is green, down is red, degraded sits between in grey, and no data is a faint bar.
const BAR: Record<Status | "none", string> = { ...DOT, none: "bg-muted" };

function barTitle(day: string, status: Status | null): string {
  return `${formatShortDate(`${day}T00:00:00+05:30`)}: ${status ?? "no data"}`;
}

function Component({ item }: { item: ComponentStatus }) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-base font-medium tracking-heading">{item.name}</h2>
        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <span aria-hidden="true" className={`size-2 ${item.current ? DOT[item.current] : "bg-muted"}`} />
          {item.current ? STATUS_WORD[item.current] : "Not checked yet"}
        </span>
      </div>
      <div className="mt-3 flex h-8 gap-px" role="img" aria-label={`${item.name}, last ${item.bars.length} days`}>
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
      <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
        {headline && <span aria-hidden="true" className={`size-2 ${DOT[headline.status]}`} />}
        {headline ? headline.text : "No checks yet"}
      </p>
      <div className="mt-10 grid gap-10">
        {components.map((item) => (
          <Component key={item.name} item={item} />
        ))}
      </div>
      {checkedAt && <p className="mt-10 text-xs text-faint">Last checked {formatDateTime(checkedAt)}</p>}
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
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 py-8 sm:px-8">
      <header className="text-sm font-medium">
        <Link href="/home" className="inline-flex items-center gap-2">
          <Logo className="size-5" />
          Uplink
        </Link>
      </header>

      <article className="py-16">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Uplink status</h1>
        <Suspense fallback={<p className="mt-2 text-sm text-muted-foreground">Checking…</p>}>
          <Components />
        </Suspense>
      </article>
      <Suspense>
        <RecordHealth />
      </Suspense>

      <footer className="mt-auto flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-t pt-6 text-xs text-faint">
        <span>Uplink is not affiliated with Tesla, Inc.</span>
        <nav aria-label="Legal" className="flex gap-4">
          <Link href="/privacy" className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
            Terms
          </Link>
        </nav>
      </footer>
    </div>
  );
}
