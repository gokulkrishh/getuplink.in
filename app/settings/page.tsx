import type { Metadata } from "next";
import Link from "next/link";
import { STATUS_URL } from "@/lib/site";
import { cacheLife, cacheTag } from "next/cache";
import { Suspense } from "react";
import { Header, PhoneNav } from "@/components/header";
import { buttonVariants } from "@/components/ui/button";
import { ThemePicker } from "@/components/theme-picker";
import { STATES } from "@/lib/india-states";
import { formatAgo, formatDate, formatSeen, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { currentOwner, ownerOnlyExit } from "@/lib/server/auth";
import { lastCheckAt, OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { ownHomeState, type OwnHomeState } from "@/lib/server/home-state";
import { lastReadingAt } from "@/lib/server/telemetry";
import { accountInfo, type AccountInfo } from "@/lib/server/tesla";
import { type Connector } from "@/lib/connectors";
import { listConnectors } from "@/lib/server/connector-token";
import { budgetState, type BudgetState } from "@/lib/server/usage";
import { checkCadence, nextReset } from "@/lib/tesla-billing";
import { DeleteAccount, DeleteMyData, DisconnectTesla, SignOutEverywhere } from "./confirm-actions";
import { BotTemplate, McpConnector } from "./integrations";
import { Loading, Ph } from "@/components/skeleton";
import { Row } from "./row";
import { Fold } from "@/components/fold";
import { ShareSwitch } from "@/components/owners/share-controls";
import { loadViewLinks } from "@/lib/server/view-links";
import type { ViewLink } from "@/lib/view-links";
import { ViewLinks } from "./view-links";
import { type Sharing } from "@/lib/server/data/owners";
import { sharingState } from "@/lib/server/owners";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Settings" };

// Connect your AI: settings few owners need (their own AI, the bot), closed until opened, last on the page.
function ConnectYourAi({ children }: { children: React.ReactNode }) {
  return (
    <Fold className="mt-10" rowClassName="pb-2" headClassName="" title="Connect your AI" description="Ask Claude, ChatGPT or Grok about your car." contentClassName="divide-y border-t">
      {children}
    </Fold>
  );
}

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
  connectors: Connector[] | null;
  budget: BudgetState;
  sharing: Sharing | null;
  viewLinks: ViewLink[] | null | undefined;
  now: number;
}> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  const owner = await currentOwner();
  if (!owner) return ownerOnlyExit();
  // Every owner's guest links. Null says they aren't set up yet.
  const viewLinksFor = async (): Promise<ViewLink[] | null | undefined> => {
    const page = await loadViewLinks(owner, Date.now());
    return page.available ? page.links : null;
  };
  const [account, lastCheck, lastReading, home, connectors, budget, sharing, viewLinks] = await Promise.all([
    accountInfo(owner),
    lastCheckAt(owner),
    lastReadingAt(owner),
    // Never fails the page: an unknown home state just says so.
    ownHomeState(owner).catch((err): OwnHomeState => {
      console.warn("Home state unavailable:", (err as Error).message);
      return { state: null, source: null, locationAllowed: false, askLocation: false };
    }),
    // Never fails the page either: the section says it couldn't load them.
    listConnectors(owner).catch((err): null => {
      console.warn("Connectors unavailable:", (err as Error).message);
      return null;
    }),
    // Never fails the page: an unreadable usage reads as the normal cadence.
    budgetState(),
    // Never fails the page: unreadable reads as off.
    sharingState(owner).catch((err): Sharing => {
      console.warn("Sharing state unavailable:", (err as Error).message);
      return { on: false, since: null };
    }),
    viewLinksFor().catch((err): null => {
      console.warn("View links unavailable:", (err as Error).message);
      return null;
    }),
  ]);
  // The clock is read inside the cache; reading it while rendering blocks prerendering.
  return { account, lastCheck, lastReading, home, connectors, budget, sharing, viewLinks, now: Date.now() };
}

async function Settings() {
  const { account, lastCheck, lastReading, home, connectors, budget, sharing, viewLinks, now } = await loadSettings();
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

      <Group title="Account">
        {account.connected ? (
          <DisconnectTesla
            description={
              <>
                <p>{connectedDescription}</p>
                <p className="text-faint">Disconnecting stops Uplink reading your car. Your history stays.</p>
                <p className="text-faint">To remove Uplink&apos;s key, open Controls &gt; Locks in your car.</p>
              </>
            }
          />
        ) : (
          <Row
            title="Tesla account"
            description="Not connected"
            control={
              <a href="/api/auth/connect" className={buttonVariants({ variant: "outline", size: "lg" })}>
                Connect Tesla
              </a>
            }
          />
        )}
        <SignOutEverywhere />
      </Group>

      <Group title="Your data">
        <Row
          id="share"
          title="Share with other owners"
          description="Adds your car to the totals on the Compare page. Turning it off deletes your figures, and your car leaves the totals at 3:30 AM."
          control={<ShareSwitch on={sharing?.on ?? false} />}
        />
        {viewLinks !== undefined && <ViewLinks links={viewLinks} now={now} />}
        <DeleteMyData />
        <DeleteAccount />
      </Group>

      <ConnectYourAi>
        <McpConnector connectors={connectors} now={now} />
        <BotTemplate />
      </ConnectYourAi>
    </>
  );
}

// The Guest access row's placeholder: its title and line, with a block as big as Create guest link (an outline
// lg button, 36px, 40px on a phone) as the control. Open links aren't drawn: most owners have none.
function GuestSkeleton() {
  return (
    <Row
      title={<Ph>Guest access</Ph>}
      description={<p><Ph>Let someone you trust see your car data.</Ph></p>}
      control={<Skeleton className="h-9 w-[9.125rem] rounded-lg max-sm:h-10" aria-hidden="true" />}
    />
  );
}

// Faint blocks in the shape of the groups and their rows, built from the same Group and Row. Connect your AI
// renders closed, so only its heading is drawn.
function SettingsSkeleton() {
  const button = <Skeleton className="h-9 w-24 rounded-lg max-sm:h-10" aria-hidden="true" />;
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
              <Skeleton className="inline-flex rounded-lg text-sm max-sm:h-[47px]" aria-hidden="true">
                {["System", "Light", "Dark"].map((label) => (
                  <span key={label} className="invisible border-y px-3 py-2 first:border-l last:border-r max-sm:py-3">
                    {label}
                  </span>
                ))}
              </Skeleton>
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
            control={
              <p className="inline-flex items-center gap-2 text-sm whitespace-nowrap">
                <span className="size-1.5" aria-hidden="true" />
                <span>{text("Synced 2 minutes ago")}</span>
              </p>
            }
          />,
          <Row
            key="home"
            title={<Ph>Home state</Ph>}
            description={<p>{text("For the India rollout map. Only the state is kept here.")}</p>}
            control={
              <p className="text-right text-sm">
                {text("Karnataka")}
                <span className="block text-sm">{text("from your car's location")}</span>
              </p>
            }
          />,
        )}
        {group(
          "Account",
          <Row key="tesla" title={<Ph>Tesla account</Ph>} description={
              <>
                <p>{text("Connected since 4 Jan 2026")}</p>
                <p>{text("Disconnecting stops Uplink reading your car. Your history stays.")}</p>
                <p>{text("To remove Uplink's key, open Controls > Locks in your car.")}</p>
              </>
            }
            control={button}
          />,
          <Row key="out" title={<Ph>Sign out everywhere</Ph>} description={<p>{text("Signs out every device, including this one.")}</p>} control={button} />,
        )}
        {group(
          "Your data",
          <Row
            key="share"
            title={<Ph>Share with other owners</Ph>}
            description={<p>{text("Adds your car to the totals on the Compare page. Turning it off deletes your figures, and your car leaves the totals at 3:30 AM.")}</p>}
            control={
              <div className="flex items-center max-sm:h-[52px]" aria-hidden="true">
                <Skeleton className="h-[1.15rem] w-8 rounded-full" />
              </div>
            }
          />,
          <GuestSkeleton key="guest" />,
          <Row key="data" title={<Ph>Delete my data</Ph>} description={<p>{text("Removes your car data and disconnects Tesla. You can sign in again.")}</p>} control={button} />,
          <Row key="acct" title={<Ph>Delete account</Ph>} description={<p>{text("Removes everything, including your Uplink account.")}</p>} control={button} />,
        )}
        <div className="mt-10 flex items-center justify-between gap-4 pb-2">
          <div>
            <p className="text-lg"><Ph>Connect your AI</Ph></p>
            <p className="text-sm"><Ph>Ask Claude, ChatGPT or Grok about your car.</Ph></p>
          </div>
          <p className="text-sm"><Ph>Show</Ph></p>
        </div>
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
      <footer className="mt-13 -mr-2 flex justify-end text-xs text-muted-foreground">
        <Link href="/privacy" className="px-2 py-3 transition-colors duration-150 hover:text-foreground">
          Privacy
        </Link>
        <Link href="/terms" className="px-2 py-3 transition-colors duration-150 hover:text-foreground">
          Terms
        </Link>
        <Link href={STATUS_URL} className="px-2 py-3 transition-colors duration-150 hover:text-foreground">
          Status
        </Link>
      </footer>
      <PhoneNav current="settings" />
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
          <p>For the India rollout map. Only the state is kept here.</p>
          {home.askLocation && <p className="text-faint">
              <a href="/api/auth/connect" className="tap-target underline decoration-muted-foreground/60 underline-offset-4 hover:text-foreground hover:decoration-foreground">
                Sign in again
              </a>{" "}
              to let Uplink read your car&apos;s location.
            </p>}
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
