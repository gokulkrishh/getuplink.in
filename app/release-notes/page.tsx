import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { Sparkles } from "lucide-react";
import { Suspense } from "react";
import { EmptyState } from "@/components/empty-state";
import { Header } from "@/components/header";
import { WelcomeTourButton } from "@/components/home/welcome-tour";
import { ReleasesList } from "@/components/releases-list";
import { WhatsNewMark } from "@/components/whats-new-mark";
import { isAdmin } from "@/lib/server/admin";
import { currentOwner, ownerOnlyExit } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { whatsNewPage } from "@/lib/server/whats-new";
import { byVersion } from "@/lib/whats-new";

export const metadata: Metadata = { title: "Release notes" };

// Session check and data in one browser-only private cache, as on Settings.
async function load() {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  const owner = await currentOwner();
  // A guest (a view link) gets not found: release notes are the owner's.
  if (!owner) return ownerOnlyExit();
  return whatsNewPage(owner, await isAdmin());
}

async function Entries() {
  const { entries, markId, newIds } = await load();
  return (
    <>
      {markId !== null && <WhatsNewMark />}
      {entries.length === 0 ? (
        <EmptyState icon={<Sparkles className="size-4 text-faint" aria-hidden="true" />} title="Nothing new yet">
          New things in Uplink will show up here.
        </EmptyState>
      ) : (
        <ReleasesList releases={byVersion(entries)} newIds={newIds} />
      )}
    </>
  );
}

export default function WhatsNewPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6 pb-12 sm:pt-8 sm:pb-20">
      <Header setup={false} />
      {/* The welcome tour, again: new owners see it once on Home; here anyone can replay it (it writes nothing). Under the heading on a very narrow phone, so the heading stays on one line. */}
      <div className="mb-8 flex flex-col items-start gap-3 min-[360px]:flex-row min-[360px]:justify-between min-[360px]:gap-4">
        <div>
          <h1 className="text-[1.5rem] font-medium tracking-heading max-sm:text-[1.25rem]">Release notes</h1>
          <p className="mt-1 text-sm text-muted-foreground">New in Uplink, newest first.</p>
        </div>
        <div className="shrink-0 sm:mt-0.5">
          <WelcomeTourButton />
        </div>
      </div>
      <Suspense>
        <Entries />
      </Suspense>
    </div>
  );
}
