import Link from "next/link";
import { LogOut, Settings, User } from "lucide-react";
import { logout } from "@/app/actions";
import { Logo } from "@/components/logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type Section = "updates" | "settings";

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
        <Link
          href="/updates"
          prefetch={true}
          aria-current={current === "updates" ? "page" : undefined}
          className={cn("hover:text-foreground", current === "updates" && "text-foreground")}
        >
          Updates
        </Link>
        {/* The menu's Sign out item submits this form by id, so signing out stays the same POST to the
            server action; the form sits outside the menu because the menu's popup unmounts on close. */}
        <form id="sign-out" action={logout} hidden />
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Account menu"
            className="flex size-8 cursor-pointer items-center justify-center rounded-full border bg-background hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none data-popup-open:bg-muted data-popup-open:text-foreground"
          >
            <User className="size-4" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem render={<Link href="/settings" prefetch={true} />}>
              <Settings aria-hidden />
              Settings
            </DropdownMenuItem>
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
