import Link from "next/link";
import { cookies } from "next/headers";
import { cacheLife } from "next/cache";
import { Bell, LogOut, Settings, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AvatarBlob } from "@/components/avatar-blob";
import { FeedbackButton } from "@/components/feedback-button";
import { FeedbackMenuItem } from "@/components/feedback-menu-item";
import { Logo } from "@/components/logo";
import { SignOutForm } from "@/components/sign-out-form";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isAdmin } from "@/lib/server/admin";
import { currentOwner, currentReader } from "@/lib/server/auth";
import { ViewLinkWatch } from "@/components/view-link-watch";
import { VIEW_BAR_COOKIE, viewBarOpen } from "@/lib/view-links";
import { ViewerBar } from "@/components/viewer-bar";
import { AlertsMenu } from "@/components/alerts-menu";
import { type Alert } from "@/lib/alerts";
import { demoAlerts, loadAlerts } from "@/lib/server/alerts";
import { setupGate } from "@/lib/server/setup";
import { DEMO } from "@/lib/demo";
import { DEMO_OWNER } from "@/lib/server/data/owner";
import { whatsNewBell } from "@/lib/server/whats-new";
import { cn } from "@/lib/utils";

export type Section = "stats" | "car" | "settings";

const NAV: { section: Section; href: string; label: string }[] = [
  { section: "stats", href: "/stats/driving", label: "Stats" },
  { section: "car", href: "/car", label: "Car" },
];

// The session decides it, so it streams in behind its own Suspense: the header itself stays in the static shell.
async function adminSession(): Promise<boolean> {
  "use cache: private";
  cacheLife({ stale: 300 });
  return isAdmin();
}

// The avatar's seed is the Tesla account, so it streams in like the Admin item; until then (and in
// demo mode, with no account) the blob draws from a fixed seed.
const FALLBACK_SEED = "uplink";

async function accountSeed(): Promise<string> {
  "use cache: private";
  cacheLife({ stale: 300 });
  if (DEMO) return FALLBACK_SEED;
  return (await currentOwner())?.sub ?? FALLBACK_SEED;
}

async function AccountAvatar() {
  return <AvatarBlob seed={await accountSeed()} />;
}

// Only the admin (users.role = 'admin') sees the Admin item, which opens Overview, Access and Costs; for
// everyone else those pages are a 404.
async function AdminItem() {
  if (!(await adminSession())) return null;
  return (
    <DropdownMenuItem render={<Link href="/admin" prefetch={true} />}>
      <ShieldCheck aria-hidden />
      Admin
    </DropdownMenuItem>
  );
}

const BELL = "tap-target relative flex size-8 items-center justify-center rounded-full text-muted-foreground";

// The alerts bell, in two parts (see lib/alerts.ts): "Needs you" (a key removed from the car, access
// running out, a car gone quiet, an unpaid Supercharger balance, Tesla not connected, a failed check, and
// for the admin a part of Uplink not working) and "Good to know" (news, like a service visit). Only what
// needs the owner lights the blue dot and counts in the label. From what's stored, so it never holds the
// page up on Tesla. Demo mode shows a sample of each part.
async function AlertsBell() {
  // Request time only: the alerts and their "since" read the clock.
  await connection();
  if (DEMO) return <BellMenu alerts={[...demoAlerts(), ...(await whatsNewBell(DEMO_OWNER, false))]} now={Date.now()} />;
  const owner = await currentOwner();
  if (!owner) return null;
  return <BellMenu alerts={await loadAlerts(owner, await adminSession())} now={Date.now()} />;
}

function BellMenu({ alerts, now }: { alerts: Alert[]; now: number }) {
  return <AlertsMenu alerts={alerts} now={now} className={BELL} />;
}

// The bell's place while the alerts load: grey, as with nothing to show, so it only lights up when something needs you.
function BellPlaceholder({ loading = false }: { loading?: boolean }) {
  return (
    <span className={cn(BELL, "text-muted-foreground/40")} aria-hidden data-owner-placeholder={loading || undefined}>
      <Bell className="size-4" />
    </span>
  );
}

// Sends an owner whose car lacks Uplink's key to /setup (lib/server/setup.ts setupGate). It reads the
// stored answer, asking Tesla only when that's old. The admin, never sent there, gets the one red note when
// the key is gone. A key Tesla didn't answer for shows no note: the bell lists it under Good to know.
// Streams in behind its own Suspense, so the redirect is a client-side one once the shell is out.
async function SetupGate() {
  if (DEMO) return null;
  // Request time only: the session check reads the clock, which a prerender (or a runtime prefetch) may not.
  await connection();
  const owner = await currentOwner();
  if (!owner) return null;
  const gate = await setupGate(owner, { admin: await adminSession() });
  if (gate === "setup") redirect("/setup");
  if (gate !== "key-removed") return null;
  return (
    <SetupNote icon={<TriangleAlert className="size-4 text-destructive" aria-hidden />} action="Add the key again">
      <span className="font-medium">Uplink&apos;s key is no longer on your car.</span> Your car has stopped sending data.
    </SetupNote>
  );
}

// The gate's one note under the header: the key is gone, so no data comes in. A red-tinted box with a
// button to /setup. On a phone the button sits under the words; from sm up, beside them.
function SetupNote({ icon, action, children }: { icon: React.ReactNode; action: string; children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="-mt-12 mb-12 grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-foreground sm:grid-cols-[auto_1fr_auto] sm:items-center dark:bg-destructive/10"
    >
      <span className="flex h-5 items-center">{icon}</span>
      <p>{children}</p>
      <Link href="/setup" prefetch={true} className={cn(buttonVariants({ variant: "default", size: "sm" }), "col-start-2 justify-self-start sm:col-start-3")}>
        {action}
      </Link>
    </div>
  );
}

// ---- Someone the owner sent a view link ----

type ViewerHeader = { expiresAt: string };

// Whether this request is a viewer's, and what their bar says. Private and short, like the session's.
async function viewerSession(): Promise<ViewerHeader | null> {
  "use cache: private";
  cacheLife({ stale: 30 });
  if (DEMO) return null;
  const reader = await currentReader();
  if (!reader?.viewer) return null;
  const { viewer } = reader;
  return { expiresAt: viewer.expiresAt };
}

// The owner's own controls (Sign out, the bell, the account menu, feedback): never a viewer's, whose nav is
// just the page links. The owner's placeholders show while it's decided, so the owner's header never moves.
async function OwnerControls({ children }: { children: React.ReactNode }) {
  return (await viewerSession()) ? null : children;
}

// The guest pill floating at the bottom of every page (components/viewer-bar.tsx), open or folded as its
// cookie says, and the watch for the link ending. It streams in after the shared static shell, but the
// page's first script has already made room for it (GUEST_SCRIPT in lib/view-links.ts), so nothing moves.
async function ViewerBanner() {
  const viewer = await viewerSession();
  if (!viewer) return null;
  // Request time, so reading the clock below isn't part of the prerender.
  await connection();
  const open = viewBarOpen((await cookies()).get(VIEW_BAR_COOKIE)?.value, viewer.expiresAt, Date.now());
  return (
    <>
      <ViewerBar open={open} expiresAt={viewer.expiresAt} />
      <ViewLinkWatch />
    </>
  );
}

// The same header on every signed-in page; `current` marks the page's own link (Stats for every /stats page).
// The logo is the way home. Updates and the India rollout sit under Car.
// `setup={false}` leaves out the setup gate: Settings (sign out, disconnect, delete), the admin pages and /setup itself.
// `onSetup`: the page is /setup, which an owner has to finish before anything else works, so the header
// keeps only the logo and the account menu (Settings, Sign out): no page links, no bell.
export function Header({ current, setup = true, onSetup = false }: { current?: Section; setup?: boolean; onSetup?: boolean }) {
  // While it's decided whether this is a viewer: the owner's controls as placeholders, the same size, with
  // nothing behind them read (the live bell and avatar render once, in OwnerControls' children). Marked
  // data-owner-placeholder, so a guest's page never shows them (globals.css): Stats and Car stay put.
  const loadingControls = (
    <>
      {!onSetup && <BellPlaceholder loading />}
      <span className="flex size-8 items-center justify-center rounded-full border bg-background [&>*]:rounded-full" aria-hidden data-owner-placeholder>
        <AvatarBlob seed={FALLBACK_SEED} />
      </span>
    </>
  );
  const ownerControls = (
    <>
      {/* The menu's Sign out item submits this form by id, so signing out stays the same POST to the
          server action; the form sits outside the menu because the menu's popup unmounts on close. Offline,
          it says so under the header (see SignOutForm). */}
      <SignOutForm />
      {!onSetup && (
        <Suspense fallback={<BellPlaceholder />}>
          <AlertsBell />
        </Suspense>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Account menu"
          className="tap-target flex size-8 cursor-pointer items-center justify-center rounded-full border [&>*]:rounded-full bg-background hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none data-popup-open:bg-muted"
        >
          <Suspense fallback={<AvatarBlob seed={FALLBACK_SEED} />}>
            <AccountAvatar />
          </Suspense>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem render={<Link href="/settings" prefetch={true} />}>
            <Settings aria-hidden />
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/release-notes" prefetch={true} />}>
            <Sparkles aria-hidden />
            Release notes
          </DropdownMenuItem>
          <FeedbackMenuItem />
          <Suspense>
            <AdminItem />
          </Suspense>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<button type="submit" form="sign-out" />} nativeButton className="w-full">
            <LogOut aria-hidden />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
  return (
    <>
    {/* Every signed-in page has the header, so the feedback button rides with it. Never a guest's, not even
        while loading: it is fixed to the corner, so arriving late moves nothing. */}
    <Suspense>
      <OwnerControls>
        <FeedbackButton />
      </OwnerControls>
    </Suspense>
    <Suspense>
      <ViewerBanner />
    </Suspense>
    <header className="relative mb-16 flex items-center justify-between gap-4 text-sm">
      <Link href="/" prefetch={true} className="tap-target flex shrink-0 items-center gap-2.5 font-medium">
        <Logo className="size-5" />
        Uplink
      </Link>
      {/* Tighter on the narrowest phones (320 px), where the alerts bell would otherwise push the row wider than the screen. */}
      <nav aria-label="Main" className="flex items-center gap-4 whitespace-nowrap text-muted-foreground max-[359px]:gap-2">
        {!onSetup && NAV.map((item) => (
          <Link
            key={item.section}
            href={item.href}
            prefetch={true}
            aria-current={current === item.section ? "page" : undefined}
            className={cn("tap-target hover:text-foreground", current === item.section && "text-foreground")}
          >
            {item.label}
          </Link>
        ))}
        <Suspense fallback={loadingControls}>
          <OwnerControls>{ownerControls}</OwnerControls>
        </Suspense>
      </nav>
    </header>
    {setup && (
      <Suspense>
        <SetupGate />
      </Suspense>
    )}
    </>
  );
}
