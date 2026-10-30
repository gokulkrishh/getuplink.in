import type { Metadata } from "next";
import Image from "next/image";
import { cacheLife, cacheTag } from "next/cache";
import { Sparkles } from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { EmptyState } from "@/components/empty-state";
import { Header } from "@/components/header";
import { WhatsNewMark } from "@/components/whats-new-mark";
import { formatShortDate } from "@/lib/format";
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
  const releases = byVersion(entries);
  const firstImageId = entries.find((e) => e.image)?.id;
  return (
    <>
      {markId !== null && <WhatsNewMark />}
      {entries.length === 0 ? (
        <EmptyState icon={<Sparkles className="size-4 text-faint" aria-hidden="true" />} title="Nothing new yet">
          New things in Uplink will show up here.
        </EmptyState>
      ) : (
        <div className="space-y-16">
          {releases.map((r) => (
            <section key={r.version} aria-labelledby={`v${r.version}`} className="space-y-8">
              <h2 id={`v${r.version}`} className="flex items-baseline gap-3 text-lg font-medium tracking-heading">
                Version {r.version}
                <span className="text-sm font-normal text-muted-foreground">{formatShortDate(`${r.entries[0].date}T00:00:00+05:30`)}</span>
              </h2>
              <ul className="space-y-12">
                {r.entries.map((e) => (
                  <li key={e.id} className="space-y-3">
                    <div className="space-y-0.5">
                      <h3 className="text-sm font-medium">{e.title}</h3>
                      <p className="text-sm text-muted-foreground">{e.more ? `${e.text} ${e.more}` : e.text}</p>
                    </div>
                    {e.image && (
                      <Image
                        src={e.image.src}
                        alt={e.image.alt}
                        width={e.image.width}
                        height={e.image.height}
                        sizes="(min-width: 672px) 632px, 100vw"
                        priority={e.id === firstImageId}
                        className="h-auto w-full border"
                      />
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
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
    </div>
  );
}
