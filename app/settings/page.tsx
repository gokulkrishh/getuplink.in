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
import { Loading, Ph } from "@/components/skeleton";
import { Row } from "./row";
import { ShareSwitch } from "@/components/owners/share-controls";
import { type Sharing } from "@/lib/server/data/owners";
import { sharingState } from "@/lib/server/owners";

export const metadata: Metadata = { title: "Settings" };

function Group({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
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
  sharing: Sharing | null;
  now: number;
}> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  const owner = await currentOwner();
  if (!owner) redirect(SIGNED_OUT_PATH);
  const [account, lastCheck, lastReading, home, connector, budget, sharing] = await Promise.all([
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
    // Never fails the page: unreadable reads as off.
    sharingState(owner).catch((err): Sharing => {
      console.warn("Sharing state unavailable:", (err as Error).message);
      return { on: false, since: null };
    }),
  ]);
  // The clock is read inside the cache; reading it while rendering blocks prerendering.
  return { account, lastCheck, lastReading, home, connector, budget, sharing, now: Date.now() };
}

async function Settings() {
  const { account, lastCheck, lastReading, home, connector, budget, sharing, now } = await loadSettings();
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
        <Row
          title="Share with other owners"
          description="Adds your car to the totals on Owners. Turning it off deletes your figures, and your car leaves the totals at 3:30 AM."
          control={<ShareSwitch on={sharing?.on ?? false} />}
        />
        <DeleteMyData />
        <DeleteAccount />
      </Group>
    </>
  );
}

// Faint blocks in the shape of the groups and their rows, built from the same Group and Row. The two
// integrations are a row each with a block under it for what opens there (the connector's steps and token).
function SettingsSkeleton() {
  const button = <div className="h-9 w-24 bg-muted motion-safe:animate-pulse max-sm:h-10" aria-hidden="true" />;
  const text = (words: string) => <Ph>{words}</Ph>;
  const group = (title: string, ...rows: React.ReactNode[]) => <Group title={<Ph>{title}</Ph>}>{rows}</Group>;
  return (
    <Loading>
        {group(
          "General",
          <Row
            key="theme"
            title={<Ph>Theme</Ph>}
            description={text("Saved in this browser.")}
            control={
              <div className="inline-flex border text-sm">
                {["System", "Light", "Dark"].map((label) => (
                  <span key={label} className="px-3 py-1.5 max-sm:py-2">
                    <Ph>{label}</Ph>
                  </span>
                ))}
              </div>
            }
          />,
          <Row
            key="live"
            title={<Ph>Live data</Ph>}
            description={
              <>
                <p>{text("Your car sends data while it's awake. Uplink never wakes it.")}</p>
                <p>{text("Full check every 12 hours, last at 4:51 PM IST")}</p>
              </>
            }
            control={<p className="text-sm whitespace-nowrap">{text("Synced 2 minutes ago")}</p>}
          />,
          <Row
            key="home"
            title={<Ph>Home state</Ph>}
            description={<p>{text("For the India rollout map. Uplink keeps only the state, never where your car is.")}</p>}
            control={
              <p className="text-right text-sm">
                {text("Karnataka")}
                <span className="block text-sm">{text("from your car's location")}</span>
              </p>
            }
          />,
        )}
        {group(
          "Integrations",
          <Row
            key="mcp"
            title={<Ph>MCP connector</Ph>}
            control={<p className="text-sm">{text("Not set up")}</p>}
          >
            <div className="mt-3 h-[174px] bg-muted motion-safe:animate-pulse max-sm:h-[214px]" />
          </Row>,
          <Row
            key="bot"
            title={<Ph>Uplink Bot</Ph>}
            description={<p>{text("An always-on AI bot that finds charging invoices in Gmail, or in chat, and attaches them to your charges.")}</p>}
            control={button}
          >
            <div className="mt-3 h-[106px] bg-muted motion-safe:animate-pulse max-sm:h-[169px]" />
          </Row>,
        )}
        {group(
          "Account",
          <Row key="tesla" title={<Ph>Tesla account</Ph>} description={<p>{text("Connected since 4 Jan 2026")}</p>} control={button} />,
          <Row key="out" title={<Ph>Sign out everywhere</Ph>} description={<p>{text("Signs out every device, including this one.")}</p>} control={button} />,
        )}
        {group(
          "Your data",
          <Row
            key="share"
            title={<Ph>Share with other owners</Ph>}
            description={<p>{text("Adds your car to the totals on Owners. Turning it off deletes your figures, and your car leaves the totals at 3:30 AM.")}</p>}
            control={<div className="h-6 w-11 rounded-full bg-muted motion-safe:animate-pulse" aria-hidden="true" />}
          />,
          <Row key="data" title={<Ph>Delete my data</Ph>} description={<p>{text("Deletes everything Uplink holds about your cars and disconnects Tesla.")}</p>} control={button} />,
          <Row key="acct" title={<Ph>Delete account</Ph>} description={<p>{text("Deletes all your data and your Uplink account.")}</p>} control={button} />,
        )}
    </Loading>
  );
}

export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6 pb-12 sm:pt-8 sm:pb-20">
      <Header current="settings" setup={false} />
      <h1 className="mb-8 text-[1.5rem] font-medium tracking-heading max-sm:text-[1.25rem]">Settings</h1>
      <Suspense fallback={<SettingsSkeleton />}>
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
