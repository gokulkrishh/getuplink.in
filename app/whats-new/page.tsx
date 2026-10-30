import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { Sparkles } from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { EmptyState } from "@/components/empty-state";
import { Header } from "@/components/header";
import { WelcomeTourButton } from "@/components/home/welcome-tour";
import { ReleasesList } from "@/components/releases-list";
import { WhatsNewMark } from "@/components/whats-new-mark";
import { isAdmin } from "@/lib/server/admin";
import { currentOwner, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { whatsNewPage } from "@/lib/server/whats-new";
import { byVersion } from "@/lib/whats-new";

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
        <ReleasesList releases={byVersion(entries)} />
      )}
    </>
  );
}

export default function WhatsNewPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6 pb-12 sm:pt-8 sm:pb-20">
      <Header setup={false} />
      {/* The welcome tour, again: new owners see it once on Home; here anyone can replay it (it writes nothing). */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[1.5rem] font-medium tracking-heading max-sm:text-[1.25rem]">What&apos;s new</h1>
          <p className="mt-1 text-sm text-muted-foreground">New in Uplink, newest first.</p>
        </div>
        <WelcomeTourButton />
      </div>
      <Suspense>
        <Entries />
      </Suspense>
    </div>
  );
}
