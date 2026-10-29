import Link from "next/link";
import { cacheLife } from "next/cache";
import { Bell, Info, LogOut, Settings, ShieldCheck, TriangleAlert } from "lucide-react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { logout } from "@/app/actions";
import { AvatarBlob } from "@/components/avatar-blob";
import { FeedbackButton } from "@/components/feedback-button";
import { FeedbackMenuItem } from "@/components/feedback-menu-item";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isAdmin } from "@/lib/server/admin";
import { currentOwner } from "@/lib/server/auth";
import type { Alert } from "@/lib/alerts";
import { loadAlerts } from "@/lib/server/alerts";
import { setupGate } from "@/lib/server/setup";
import { DEMO } from "@/lib/demo";
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

// The alerts bell: a blue dot when something needs the owner (a key removed from the car, Tesla access
// expired, a failed check, and for the admin a part of Uplink not working; see lib/alerts.ts), and the
// list with where to fix each. From what's stored, so it never holds the page up on Tesla.
// Demo mode has no account to check, so its bell opens to "No problems right now." rather than doing nothing.
async function AlertsBell() {
  if (DEMO) return <BellMenu alerts={[]} />;
  await connection();
  const owner = await currentOwner();
  if (!owner) return null;
  return <BellMenu alerts={await loadAlerts(owner, await adminSession())} />;
}

function BellMenu({ alerts }: { alerts: Alert[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={alerts.length === 0 ? "Alerts, none" : `Alerts, ${alerts.length} ${alerts.length === 1 ? "problem" : "problems"}`}
        // Greyed out with nothing to say; full strength, with the dot, when something needs the owner.
        className={cn(
          BELL,
          alerts.length === 0 ? "text-muted-foreground/40" : "text-foreground",
          "cursor-pointer hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none data-popup-open:bg-muted",
        )}
      >
        <Bell className="size-4" aria-hidden />
        {alerts.length > 0 && <span className="absolute top-1 right-1 size-2 rounded-full bg-chart-accent ring-2 ring-background" aria-hidden />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {alerts.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">No problems right now.</p>
        ) : (
          alerts.map((a) => (
            <DropdownMenuItem key={a.key} render={<Link href={a.href} prefetch={true} />} className="flex-col items-start gap-0.5 whitespace-normal">
              <span className="text-sm text-foreground">{a.title}</span>
              <span className="text-xs text-muted-foreground">{a.detail}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// The bell's place while the alerts load.
function BellPlaceholder() {
  return (
    <span className={BELL} aria-hidden>
      <Bell className="size-4" />
    </span>
  );
}

// Sends an owner whose car lacks Uplink's key to /setup (lib/server/setup.ts setupGate). It reads the
// stored answer, asking Tesla only when that's old; when Tesla's answer is missing it shows a note instead.
// Streams in behind its own Suspense, so the redirect is a client-side one once the shell is out.
async function SetupGate() {
  if (DEMO) return null;
  // Request time only: the session check reads the clock, which a prerender (or a runtime prefetch) may not.
  await connection();
  const owner = await currentOwner();
  if (!owner) return null;
  const gate = await setupGate(owner, { admin: await adminSession() });
  if (gate === "setup") redirect("/setup");
  if (gate === "pass") return null;
  if (gate === "key-removed") {
    return (
      <SetupNote urgent icon={<TriangleAlert className="size-4 text-destructive" aria-hidden />} action="Add the key again">
        <span className="font-medium">Uplink&apos;s key is no longer on your car.</span> Your car has stopped sending data.
      </SetupNote>
    );
  }
  return (
    <SetupNote icon={<Info className="size-4 text-muted-foreground" aria-hidden />} action="Open setup">
      Uplink couldn&apos;t check your car&apos;s key with Tesla. It will try again.
    </SetupNote>
  );
}

// The gate's note under the header: a tinted box with what's wrong and a button to /setup. `urgent` (the
// key is gone, so no data comes in) is red-tinted; the rest are calm. On a phone the button sits under the
// words; from sm up, beside them.
function SetupNote({ urgent = false, icon, action, children }: { urgent?: boolean; icon: React.ReactNode; action: string; children: React.ReactNode }) {
  return (
    <div
      role="status"
      className={cn(
        "-mt-12 mb-12 grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-3 border p-3 text-sm sm:grid-cols-[auto_1fr_auto] sm:items-center",
        urgent ? "border-destructive/40 bg-destructive/5 text-foreground dark:bg-destructive/10" : "bg-muted/60 text-muted-foreground",
      )}
    >
      <span className="flex h-5 items-center">{icon}</span>
      <p>{children}</p>
      <Link
        href="/setup"
        prefetch={true}
        className={cn(buttonVariants({ variant: urgent ? "default" : "outline", size: "sm" }), "col-start-2 justify-self-start sm:col-start-3")}
      >
        {action}
      </Link>
    </div>
  );
}

// The same header on every signed-in page; `current` marks the page's own link (Stats for every /stats page).
// The logo is the way home. Updates and the India rollout sit under Car.
// `setup={false}` leaves out the setup gate: Settings (sign out, disconnect, delete), the admin pages and /setup itself.
// `onSetup`: the page is /setup, which an owner has to finish before anything else works, so the header
// keeps only the logo and the account menu (Settings, Sign out): no page links, no bell.
export function Header({ current, setup = true, onSetup = false }: { current?: Section; setup?: boolean; onSetup?: boolean }) {
  return (
    <>
    {/* Every signed-in page has the header, so the feedback button rides with it. */}
    <FeedbackButton />
    <header className="mb-16 flex items-center justify-between gap-4 text-sm">
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
        {/* The menu's Sign out item submits this form by id, so signing out stays the same POST to the
            server action; the form sits outside the menu because the menu's popup unmounts on close. */}
        <form id="sign-out" action={logout} hidden />
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
