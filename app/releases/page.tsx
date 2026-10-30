import type { Metadata } from "next";
import Link from "next/link";
import { cacheLife, cacheTag } from "next/cache";
import { Sparkles } from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { EmptyState } from "@/components/empty-state";
import { Header } from "@/components/header";
import { buttonVariants } from "@/components/ui/button";
import { WhatsNewMark } from "@/components/whats-new-mark";
import { WhatsNewPlaces } from "@/components/whats-new-places";
import { formatShortDate } from "@/lib/format";
import { isAdmin } from "@/lib/server/admin";
import { currentOwner, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { whatsNewPage } from "@/lib/server/whats-new";

export const metadata: Metadata = { title: "What's new" };

// Session check and data in one browser-only private cache, as on Settings.
async function load() {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  const owner = await currentOwner();
  if (!owner) redirect(SIGNED_OUT_PATH);
  return whatsNewPage(owner, await isAdmin());
}

async function Entries() {
  const { entries, markId } = await load();
  return (
    <>
      {markId !== null && <WhatsNewMark />}
      {entries.length === 0 ? (
        <EmptyState icon={<Sparkles className="size-4 text-faint" aria-hidden="true" />} title="Nothing new yet">
          New things in Uplink will show up here.
        </EmptyState>
      ) : (
        <ul className="divide-y border-y">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-col items-start gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
              <div className="min-w-0 space-y-0.5">
                <p className="font-mono text-xs text-faint">{formatShortDate(`${e.date}T00:00:00+05:30`)}</p>
                <h2 className="text-sm font-medium">{e.title}</h2>
                <p className="text-sm text-muted-foreground">{e.more ? `${e.text} ${e.more}` : e.text}</p>
              </div>
              <Link href={e.link.href} className={buttonVariants({ variant: "outline", size: "sm" })}>
                {e.link.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function WhatsNewPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6 pb-12 sm:pt-8 sm:pb-20">
      <Header setup={false} />
      <h1 className="text-[1.5rem] font-medium tracking-heading max-sm:text-[1.25rem]">What&apos;s new</h1>
      <p className="mt-1 mb-8 text-sm text-muted-foreground">New in Uplink, newest first.</p>
      <Suspense>
        <Entries />
      </Suspense>
      <section id="where-things-are" className="mt-10 scroll-mt-6 space-y-3">
        <h2 className="text-lg font-medium tracking-heading">Where things are</h2>
        <WhatsNewPlaces />
      </section>
    </div>
  );
}
