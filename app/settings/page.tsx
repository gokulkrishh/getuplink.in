import type { Metadata } from "next";
import Link from "next/link";
import { STATUS_URL } from "@/lib/site";
import { cacheLife, cacheTag } from "next/cache";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Header } from "@/components/header";
import { ThemePicker } from "@/components/theme-picker";
import { STATES } from "@/lib/india-states";
import { formatAgo, formatDate, formatSeen, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { currentOwner, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { lastCheckAt, OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { ownHomeState, type OwnHomeState } from "@/lib/server/home-state";
import { lastReadingAt } from "@/lib/server/telemetry";
import { accountInfo, type AccountInfo } from "@/lib/server/tesla";
import { connectorTokenStatus, type ConnectorTokenStatus } from "@/lib/server/connector-token";
import { budgetState, type BudgetState } from "@/lib/server/usage";
import { checkCadence, nextReset } from "@/lib/tesla-billing";
import { DeleteAccount, DeleteMyData, DisconnectTesla, SignOutEverywhere } from "./confirm-actions";
import { BotTemplate, McpConnector } from "./integrations";
import { Row } from "./row";

export const metadata: Metadata = { title: "Settings" };

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 first:mt-0">
      <h2 className="mb-2 text-lg font-medium tracking-heading">{title}</h2>
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
  budget: BudgetState;
  now: number;
}> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  const owner = await currentOwner();
  if (!owner) redirect(SIGNED_OUT_PATH);
  const [account, lastCheck, lastReading, home, connector, budget] = await Promise.all([
    accountInfo(owner),
    lastCheckAt(owner),
    lastReadingAt(owner),
    // Never fails the page: an unknown home state just says so.
    ownHomeState(owner).catch((err): OwnHomeState => {
      console.warn("Home state unavailable:", (err as Error).message);
      return { state: null, source: null, locationAllowed: false, askLocation: false };
    }),
    // Never fails the page either: shown as not set up.
    connectorTokenStatus(owner).catch(() => null),
    // Never fails the page: an unreadable usage reads as the normal cadence.
    budgetState(),
  ]);
  // The clock is read inside the cache; reading it while rendering blocks prerendering.
  return { account, lastCheck, lastReading, home, connector, budget, now: Date.now() };
}

async function Settings() {
  const { account, lastCheck, lastReading, home, connector, budget, now } = await loadSettings();
  // Past the Tesla budget checks slow down, then pause until the month resets (lib/server/poll.ts).
  const cadence =
    budget.level === "stopped"
      ? `Full checks paused until ${formatShortDate(nextReset(now))}`
      : `Full check ${checkCadence(budget.level, nextReset(now)).toLowerCase()}`;
  const connectedDescription = account.connectedSince ? `Connected since ${formatDate(account.connectedSince)}` : "Connected";

  return (
    <>
      <Group title="General">
        <Row title="Theme" description="Saved in this browser." control={<ThemePicker />} />
        <Row
          title="Live data"
          description={
            <>
              <p>Your car sends data while it&apos;s awake. Uplink never wakes it.</p>
              <p className="text-faint">
                {lastCheck ? `${cadence}, last at ${formatSeen(lastCheck, now)}` : cadence}
              </p>
            </>
          }
          control={<LiveStatus lastReading={lastReading} now={now} />}
        />
        <HomeState home={home} />
      </Group>

      <Group title="Integrations">
        <McpConnector status={connector} now={now} />
        <BotTemplate />
      </Group>

      <Group title="Account">
        {account.connected ? (
          <DisconnectTesla description={connectedDescription} />
        ) : (
          <Row title="Tesla account" description="Not connected" />
        )}
        <Row
          title="Sign out everywhere"
          description="Signs out every device, including this one."
          control={
            <SignOutEverywhere />
          }
        />
      </Group>

      <Group title="Your data">
        <DeleteMyData />
        <DeleteAccount />
      </Group>
    </>
  );
}

export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6 pb-12 sm:pt-8 sm:pb-20">
      <Header current="settings" setup={false} />
      <h1 className="mb-8 text-[1.5rem] font-medium tracking-heading max-sm:text-[1.25rem]">Settings</h1>
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
        <Link href={STATUS_URL} className="hover:text-foreground transition-colors duration-150">
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
  if (!lastReading) return <p className="text-sm text-muted-foreground">No data yet</p>;
  const live = now - Date.parse(lastReading) < 10 * 60_000;
  return (
    <p className="inline-flex items-center gap-2 text-sm whitespace-nowrap">
      <span className={cn("size-1.5 rounded-full", live ? "bg-positive" : "bg-faint")} aria-hidden="true" />
      <span>Synced {formatAgo(lastReading, now)}</span>
    </p>
  );
}
