"use client";

import Image from "next/image";
import Link from "next/link";
import { Dialog } from "@base-ui/react/dialog";
import { useTransition } from "react";
import { markSeen } from "@/app/release-notes/actions";
import { TourBackdrop, TourDialog, type TourStep, TourSlice } from "@/components/home/tour-dialog";
import { OFFLINE, orOffline } from "@/lib/offline";
import type { Entry } from "@/lib/whats-new";

// Home's dialog for what's new (lib/whats-new.ts decides who gets it): one step for each unseen big entry,
// newest first, the same shell as the welcome tour. Closing any way marks the newest entry seen, so it shows
// once. When there are more than fit, a quiet link goes to the page.
function Shot({ entry }: { entry: Entry }) {
  const img = entry.image;
  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      <TourBackdrop />
      {img && (
        <TourSlice>
          <Image src={img.src} alt={img.alt} width={img.width} height={img.height} sizes="480px" className="h-auto w-full border bg-background shadow-xl" />
        </TourSlice>
      )}
    </div>
  );
}

export function ReleaseDialog({ entries, total }: { entries: Entry[]; total: number }) {
  const [, start] = useTransition();
  const steps: TourStep[] = entries.map((e) => ({
    key: e.id,
    chip: <span className="bg-chart-accent/15 px-2 py-0.5 text-xs font-medium text-chart-accent">New</span>,
    label: `Version ${e.version}`,
    title: e.title,
    description: e.more ? `${e.text} ${e.more}` : e.text,
    extra:
      total > entries.length ? (
        <Dialog.Close render={<Link href="/release-notes" />} nativeButton={false} className="mt-5 inline-block text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
          See all in Release notes
        </Dialog.Close>
      ) : null,
    preview: <Shot entry={e} />,
  }));
  return <TourDialog steps={steps} onOpenChange={(next) => !next && start(async () => void (await orOffline(markSeen(), OFFLINE)))} />;
}
