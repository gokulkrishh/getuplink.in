import Link from "next/link";
import { cacheLife } from "next/cache";
import { Bell, LogOut, Settings, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { logout } from "@/app/actions";
import { AvatarBlob } from "@/components/avatar-blob";
import { FeedbackButton } from "@/components/feedback-button";
import { Logo } from "@/components/logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isAdmin } from "@/lib/server/admin";
import { currentOwner } from "@/lib/server/auth";
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
async function AlertsBell() {
  if (DEMO) return <BellPlaceholder />;
  await connection();
  const owner = await currentOwner();
  if (!owner) return null;
  const alerts = await loadAlerts(owner, await adminSession());
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={alerts.length === 0 ? "Alerts, none" : `Alerts, ${alerts.length} ${alerts.length === 1 ? "problem" : "problems"}`}
        className={cn(BELL, "cursor-pointer hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none data-popup-open:bg-muted")}
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

// The bell's place while the alerts load, and in demo mode (no account to check).
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
      <p role="status" className="-mt-12 mb-12 border-l-2 pl-3 text-sm text-muted-foreground">
        Uplink&apos;s key is no longer on your car, so it stopped sending data.{" "}
        <Link href="/setup" className="underline decoration-border underline-offset-4 hover:decoration-foreground">
          Add the key again
        </Link>
      </p>
    );
  }
  return (
    <p role="status" className="-mt-12 mb-12 border-l-2 pl-3 text-sm text-muted-foreground">
      Uplink couldn&apos;t check your car&apos;s key with Tesla. It will try again.{" "}
      <Link href="/setup" className="underline decoration-border underline-offset-4 hover:decoration-foreground">
        Setup
      </Link>
    </p>
  );
}

// The same header on every signed-in page; `current` marks the page's own link (Stats for every /stats page).
// The logo is the way home. Updates and the India rollout sit under Car.
// `setup={false}` leaves out the setup gate: Settings (sign out, disconnect, delete), the admin pages and /setup itself.
export function Header({ current, setup = true }: { current?: Section; setup?: boolean }) {
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
        {NAV.map((item) => (
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
        <Suspense fallback={<BellPlaceholder />}>
          <AlertsBell />
        </Suspense>
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
