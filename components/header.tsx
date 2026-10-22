import Link from "next/link";
import { logout } from "@/app/actions";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

export type Section = "updates" | "settings";

const LINKS: { section: Section; href: string; label: string }[] = [
  { section: "updates", href: "/updates", label: "Updates" },
  { section: "settings", href: "/settings", label: "Settings" },
];

// The same header on every signed-in page; `current` marks the page's own link. The Stats pages open from
// the home page's sections and the car page from the car's name there, so they have none.
export function Header({ current }: { current?: Section }) {
  return (
    <header className="mb-16 flex items-center justify-between gap-4 text-sm">
      <Link href="/" prefetch={true} className="flex shrink-0 items-center gap-2.5 font-medium">
        <Logo className="size-5" />
        Uplink
      </Link>
      {/* Wraps rather than overflowing on a narrow phone. */}
      <nav aria-label="Main" className="flex flex-wrap items-baseline justify-end gap-x-3 gap-y-1 text-muted-foreground sm:gap-x-4">
        {LINKS.map(({ section, href, label }) => (
          <Link
            key={section}
            href={href}
            prefetch={true}
            aria-current={current === section ? "page" : undefined}
            className={cn("hover:text-foreground", current === section && "text-foreground")}
          >
            {label}
          </Link>
        ))}
        <form action={logout}>
          <button className="cursor-pointer hover:text-foreground">Sign out</button>
        </form>
      </nav>
    </header>
  );
}
