import type { Metadata } from "next";
import Link from "next/link";
import { STATUS_URL } from "@/lib/site";
import { cacheLife, cacheTag } from "next/cache";
import { cache, Suspense } from "react";
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
import { Ph } from "@/components/skeleton";
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

// The two deletes, last and on their own, in a thin red frame, so nothing that can't be undone sits beside
// everyday settings.
function DeleteGroup({ title, note, children }: { title: React.ReactNode; note: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-medium tracking-heading">{title}</h2>
      <p className="mt-0.5 mb-3 text-sm text-muted-foreground">{note}</p>
      <div className="divide-y rounded-lg border border-destructive/40 px-4">{children}</div>
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

// One read per request, shared by every piece below that needs data.
const settings = cache(loadSettings);

// The page is mostly fixed words, so they show at once. Only the parts that come from the owner's data wait,
// each in its own small Suspense with a placeholder its size, so nothing moves when they arrive.
function Settings() {
  return (
    <>
      <Group title="General">
        <Row title="Theme" description="Saved in this browser." control={<ThemePicker />} />
        <Row
          title="Live data"
          description={
            <>
              <p>Your car sends data while it&apos;s awake. Uplink never wakes it.</p>
              <Suspense fallback={<p><Ph>Full check every 12 hours, last at 11:59 AM IST</Ph></p>}>
                <LiveCadence />
              </Suspense>
            </>
          }
          control={
            <Suspense
              fallback={
                <p className="inline-flex items-center gap-2 text-sm whitespace-nowrap">
                  <span className="size-1.5" aria-hidden="true" />
                  <Ph>Synced 2 minutes ago</Ph>
                </p>
              }
            >
              <LiveControl />
            </Suspense>
          }
        />
        <Suspense fallback={<HomeState />}>
          <HomeStateLoaded />
        </Suspense>
      </Group>

      <Group title="Account">
        <Suspense fallback={<TeslaSkeleton />}>
          <TeslaRow />
        </Suspense>
        <SignOutEverywhere />
      </Group>

      <Group title="Your data">
        <Row
          id="share"
          title="Share with other owners"
          description="Adds your car to the totals on the Compare page. Turning it off deletes your figures, and your car leaves the totals at 3:30 AM."
          control={
            <Suspense
              fallback={
                <div className="flex items-center max-sm:h-[52px]" aria-hidden="true">
                  <Skeleton className="h-[1.15rem] w-8 rounded-full" />
                </div>
              }
            >
              <ShareControl />
            </Suspense>
          }
        />
        <Suspense fallback={<GuestSkeleton />}>
          <GuestRow />
        </Suspense>
      </Group>

      <DeleteGroup title="Delete" note="These can't be undone.">
        <DeleteMyData />
        <DeleteAccount />
      </DeleteGroup>

      <ConnectYourAi>
        <Suspense fallback={<Row title="MCP connectors" description={<p><Ph>Loading your connectors</Ph></p>} />}>
          <Connectors />
        </Suspense>
        <BotTemplate />
      </ConnectYourAi>
    </>
  );
}

// Past the Tesla budget checks slow down, then pause until the month resets (lib/server/poll.ts).
async function LiveCadence() {
  const { lastCheck, budget, now } = await settings();
  const cadence =
    budget.level === "stopped"
      ? `Full checks paused until ${formatShortDate(nextReset(now))}`
      : `Full check ${checkCadence(budget.level, nextReset(now)).toLowerCase()}`;
  return <p className="text-faint">{lastCheck ? `${cadence}, last at ${formatSeen(lastCheck, now)}` : cadence}</p>;
}

async function LiveControl() {
  const { lastReading, now } = await settings();
  return <LiveStatus lastReading={lastReading} now={now} />;
}

async function HomeStateLoaded() {
  const { home } = await settings();
  return <HomeState home={home} />;
}

async function TeslaRow() {
  const { account } = await settings();
  if (!account.connected) {
    return (
      <Row
        title="Tesla account"
        description="Not connected"
        control={
          <a href="/api/auth/connect" className={buttonVariants({ variant: "outline", size: "lg" })}>
            Connect Tesla
          </a>
        }
      />
    );
  }
  return <DisconnectTesla description={<TeslaLines since={account.connectedSince ? `Connected since ${formatDate(account.connectedSince)}` : "Connected"} />} />;
}

function TeslaLines({ since }: { since: React.ReactNode }) {
  return (
    <>
      <p>{since}</p>
      <p className="text-faint">Disconnecting stops Uplink reading your car. Your history stays.</p>
      <p className="text-faint">To remove Uplink&apos;s key, open Controls &gt; Locks in your car.</p>
    </>
  );
}

// Most owners are connected, so the placeholder has that row's shape: only the date and the button wait.
function TeslaSkeleton() {
  return <Row title="Tesla account" description={<TeslaLines since={<Ph>Connected since 4 Jan 2026</Ph>} />} control={BUTTON} />;
}

async function ShareControl() {
  const { sharing } = await settings();
  return <ShareSwitch on={sharing?.on ?? false} />;
}

async function GuestRow() {
  const { viewLinks, now } = await settings();
  return viewLinks !== undefined ? <ViewLinks links={viewLinks} now={now} /> : null;
}

async function Connectors() {
  const { connectors, now } = await settings();
  return <McpConnector connectors={connectors} now={now} />;
}

const BUTTON = <Skeleton className="h-9 w-24 rounded-lg max-sm:h-10" aria-hidden="true" />;

// The Guest access row while its links load: the real words, with a block as big as Create guest link (an
// outline lg button, 36px, 40px on a phone). Open links aren't drawn: most owners have none.
function GuestSkeleton() {
  return (
    <Row
      title="Guest access"
      description="Let someone you trust see your car data."
      control={<Skeleton className="h-9 w-[9.125rem] rounded-lg max-sm:h-10" aria-hidden="true" />}
    />
  );
}

export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6 pb-12 sm:pt-8 sm:pb-20">
      <Header current="settings" setup={false} />
      <h1 className="mb-8 text-[1.5rem] font-medium tracking-heading max-sm:text-[1.25rem]">Settings</h1>
      <Settings />
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

// Read-only: worked out from the car, for the India rollout map. Without `home` it's the loading placeholder.
function HomeState({ home }: { home?: OwnHomeState }) {
  const from = home?.source === "location" ? "from your car's location" : "from your Supercharger history";
  return (
    <Row
      title="Home state"
      description={
        <>
          <p>For the India rollout map. Only the state is kept here.</p>
          {home?.askLocation && <p className="text-faint">
              <a href="/api/auth/connect" className="tap-target underline decoration-muted-foreground/60 underline-offset-4 hover:text-foreground hover:decoration-foreground">
                Sign in again
              </a>{" "}
              to let Uplink read your car&apos;s location.
            </p>}
        </>
      }
      control={
        !home ? (
          <p className="text-right text-sm">
            <Ph>Karnataka</Ph>
            <span className="block text-sm"><Ph>from your car&apos;s location</Ph></span>
          </p>
        ) : home.state ? (
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
