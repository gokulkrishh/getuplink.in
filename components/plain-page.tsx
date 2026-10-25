import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

const PAGES = [
  { key: "privacy", href: "/privacy", label: "Privacy" },
  { key: "terms", href: "/terms", label: "Terms" },
  { key: "status", href: "/status", label: "Status" },
] as const;

type Page = (typeof PAGES)[number]["key"];

// A page of reading outside the app: privacy, terms, status, and the error and not-found pages. The wordmark,
// a title with one sentence saying what the page is, the body at a reading measure, and the same close
// (the name, the Tesla line and the other pages) on each. `home` is where the wordmark goes.
export function PlainPage({
  title,
  intro,
  meta,
  current,
  home = "/",
  wide = false,
  children,
}: {
  title: string;
  intro: ReactNode;
  meta?: ReactNode;
  current?: Page;
  home?: string;
  // A board rather than reading (status): the body takes the column's full width.
  wide?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 py-8 sm:px-8">
      <header className="text-sm font-medium">
        <Link href={home} className="inline-flex items-center gap-2 rounded-sm">
          <Logo className="size-5" />
          Uplink
        </Link>
      </header>

      <div className="my-auto pt-14 pb-20 sm:pt-20">
        <h1 className="text-xl font-medium tracking-heading text-balance sm:text-2xl">{title}</h1>
        <p className="mt-3 max-w-[60ch] text-base text-muted-foreground">{intro}</p>
        {meta && <p className="mt-2 text-sm text-faint">{meta}</p>}
        {children && <div className={cn("mt-12 grid gap-12", !wide && "max-w-[65ch]")}>{children}</div>}
      </div>

      {/* The close: the name back at a size, the Tesla line, and the other plain pages. */}
      <footer className="space-y-3 bg-muted px-5 py-6 -mx-5 sm:mx-0 sm:px-6 dark:bg-card">
        <p className="flex items-center gap-2 text-lg font-medium tracking-heading">
          <Logo className="size-5" />
          Uplink
        </p>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <span>Not affiliated with Tesla, Inc.</span>
          <nav aria-label="About Uplink" className="flex gap-4">
            {PAGES.map((page) =>
              page.key === current ? (
                <span key={page.key} aria-current="page" className="text-foreground">
                  {page.label}
                </span>
              ) : (
                <Link
                  key={page.key}
                  href={page.href}
                  className="underline decoration-border decoration-dotted underline-offset-4 transition-colors duration-150 hover:text-foreground hover:decoration-foreground"
                >
                  {page.label}
                </Link>
              ),
            )}
          </nav>
        </div>
      </footer>
    </div>
  );
}

// One part of a plain page: its heading, then running text in the full ink at reading size.
export function PlainSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium tracking-heading">{title}</h2>
      <div className="space-y-3 text-base leading-relaxed text-foreground">{children}</div>
    </section>
  );
}

// A plain page's list: full-ink items at reading size, the markers quiet.
export const PLAIN_LIST = "list-disc space-y-2 pl-5 marker:text-faint";
