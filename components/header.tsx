import Link from "next/link";
import { cacheLife } from "next/cache";
import { LogOut, Settings, ShieldCheck } from "lucide-react";
import { Suspense } from "react";
import { logout } from "@/app/actions";
import { AvatarBlob } from "@/components/avatar-blob";
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
import { DEMO } from "@/lib/demo";
import { cn } from "@/lib/utils";

export type Section = "updates" | "rollout" | "settings";

const NAV: { section: Section; href: string; label: string }[] = [
  { section: "updates", href: "/updates", label: "Updates" },
  { section: "rollout", href: "/rollout", label: "Rollout" },
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

// Only the admin (users.role = 'admin') sees the Admin item; for everyone else /admin is a 404.
async function AdminItem() {
  if (!(await adminSession())) return null;
  return (
    <DropdownMenuItem render={<Link href="/admin" prefetch={true} />}>
      <ShieldCheck aria-hidden />
      Admin
    </DropdownMenuItem>
  );
}

// The same header on every signed-in page; `current` marks the page's own link. The Stats pages open from
// the home page's sections and the car page from the car's name there, so they have none.
export function Header({ current }: { current?: Section }) {
  return (
    <header className="mb-16 flex items-center justify-between gap-4 text-sm">
      <Link href="/" prefetch={true} className="flex shrink-0 items-center gap-2.5 font-medium">
        <Logo className="size-5" />
        Uplink
      </Link>
      <nav aria-label="Main" className="flex items-center gap-3 text-muted-foreground sm:gap-4">
        {NAV.map((item) => (
          <Link
            key={item.section}
            href={item.href}
            prefetch={true}
            aria-current={current === item.section ? "page" : undefined}
            className={cn("hover:text-foreground", current === item.section && "text-foreground")}
          >
            {item.label}
          </Link>
        ))}
        {/* The menu's Sign out item submits this form by id, so signing out stays the same POST to the
            server action; the form sits outside the menu because the menu's popup unmounts on close. */}
        <form id="sign-out" action={logout} hidden />
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Account menu"
            className="flex size-8 cursor-pointer items-center justify-center overflow-hidden rounded-full border bg-background hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none data-popup-open:bg-muted"
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
  );
}
