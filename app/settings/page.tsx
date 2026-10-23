import type { Metadata } from "next";
import Link from "next/link";
import { cacheLife, cacheTag } from "next/cache";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Header } from "@/components/header";
import { ThemePicker } from "@/components/theme-picker";
import { buttonVariants } from "@/components/ui/button";
import { DEMO, DEMO_URL } from "@/lib/demo";
import { STATES } from "@/lib/india-states";
import { formatAgo, formatDate, formatSeen } from "@/lib/format";
import { cn } from "@/lib/utils";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { ownHomeState, type OwnHomeState } from "@/lib/server/home-state";
import { demoData } from "@/lib/server/demo";
import { db } from "@/lib/server/supabase";
import { lastReadingAt } from "@/lib/server/telemetry";
import { accountInfo, type AccountInfo } from "@/lib/server/tesla";
import { connectorTokenStatus, type ConnectorTokenStatus } from "@/lib/server/connector-token";
import { DeleteMyData, DisconnectTesla, SignOutEverywhere } from "./confirm-actions";
import { GrokBotTemplate, McpConnector } from "./integrations";
import { Row } from "./row";

export const metadata: Metadata = { title: "Settings · Uplink" };

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 first:mt-0">
      <h2 className="mb-2 text-xs font-medium tracking-wide text-faint uppercase">{title}</h2>
      <div className="divide-y border-t">{children}</div>
    </section>
  );
}

// Session check plus data in one browser-only private cache, so header links can prefetch it (see app/page.tsx).
async function loadSettings(): Promise<{
  account: AccountInfo;
  lastCheck: string | null;
  lastReading: string | null;
  home: OwnHomeState;
  connector: ConnectorTokenStatus;
  now: number;
}> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  const [account, run, lastReading, home, connector] = await Promise.all([
    accountInfo(),
    DEMO
      ? { data: demoData().lastRun }
      : db().from("poll_runs").select("started_at").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    lastReadingAt(),
    // Never fails the page: an unknown home state just says so.
    ownHomeState().catch((err): OwnHomeState => {
      console.warn("Home state unavailable:", (err as Error).message);
      return { state: null, source: null, locationAllowed: false, askLocation: false };
    }),
    // Never fails the page either: shown as not set up.
    connectorTokenStatus().catch(() => null),
  ]);
  // The clock is read inside the cache; reading it while rendering blocks prerendering.
  return { account, lastCheck: run.data?.started_at ?? null, lastReading, home, connector, now: Date.now() };
}

async function Settings() {
  const { account, lastCheck, lastReading, home, connector, now } = await loadSettings();
  const connectedDescription = account.connectedSince ? `Connected since ${formatDate(account.connectedSince)}` : "Connected";

  return (
    <>
      <Group title="General">
        <Row title="Theme" description="Saved in this browser." control={<ThemePicker />} />
        <Row
          title="Live data"
          description={
            <>
              <p>Your car sends updates while it&apos;s awake. Uplink never wakes it.</p>
              <p className="text-faint">
                {lastCheck ? `Full check every 6 hours, last at ${formatSeen(lastCheck, now)}` : "Full check every 6 hours"}
              </p>
            </>
          }
          control={<LiveStatus lastReading={lastReading} now={now} />}
        />
        <HomeState home={home} />
      </Group>

      {!DEMO && (
        <Group title="Demo">
          <Row
            title="See the demo"
            description="Every feature with a sample car, to see how your data will look as it builds up. Nothing from your account is shown there."
            control={
              <a href={DEMO_URL} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline", size: "lg" })}>
                View the demo
              </a>
            }
          />
        </Group>
      )}

      <Group title="Integrations">
        <McpConnector status={connector} now={now} />
        <GrokBotTemplate />
      </Group>

      <Group title="Account">
        {account.connected ? (
          <DisconnectTesla description={connectedDescription} />
        ) : (
          <Row title="Tesla account" description="Not connected" />
        )}
        <Row
          title="Sign out everywhere"
          description="Ends every session on every device, including this one."
          control={
            <SignOutEverywhere />
          }
        />
      </Group>

      <Group title="Your data">
        <DeleteMyData />
      </Group>
    </>
  );
}

export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6 pb-12 sm:pt-8 sm:pb-20">
      <Header current="settings" />
      <h1 className="mb-8 text-base font-medium tracking-heading">Settings</h1>
      <Suspense fallback={<div role="status" aria-busy="true" className="h-64 bg-muted motion-safe:animate-pulse"><span className="sr-only">Loading…</span></div>}>
        <Settings />
      </Suspense>
      <footer className="mt-16 flex justify-end gap-4 text-xs text-muted-foreground">
        <Link href="/privacy" className="hover:text-foreground transition-colors duration-150">
          Privacy
        </Link>
        <Link href="/terms" className="hover:text-foreground transition-colors duration-150">
          Terms
        </Link>
        <Link href="/status" prefetch={false} className="hover:text-foreground transition-colors duration-150">
          Status
        </Link>
      </footer>
    </div>
  );
}

// Read-only: worked out from the car, for the India rollout map.
function HomeState({ home }: { home: OwnHomeState }) {
  const from = home.source === "location" ? "from your car's location" : "from your Supercharger history";
  return (
    <Row
      title="Home state"
      description={
        <>
          <p>For the India rollout map. Uplink keeps only the state, never where your car is.</p>
          {home.askLocation && <p className="text-faint">Sign in again to let Uplink read your car&apos;s location.</p>}
        </>
      }
      control={
        home.state ? (
          <p className="text-right text-sm">
            {STATES[home.state].name}
            <span className="block text-sm text-muted-foreground">{from}</span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Not known yet</p>
        )
      }
    />
  );
}

// When the car last sent anything; the dot is green while it's streaming (a reading in the last 10
// minutes). No "asleep": a quiet car might be asleep or just out of signal, and Uplink can't tell.
function LiveStatus({ lastReading, now }: { lastReading: string | null; now: number }) {
  if (!lastReading) return <p className="text-sm text-muted-foreground">No readings yet</p>;
  const live = now - Date.parse(lastReading) < 10 * 60_000;
  return (
    <p className="inline-flex items-center gap-2 text-sm whitespace-nowrap">
      <span className={cn("size-1.5 rounded-full", live ? "bg-positive" : "bg-faint")} aria-hidden="true" />
      <span>Synced {formatAgo(lastReading, now)}</span>
    </p>
  );
}
