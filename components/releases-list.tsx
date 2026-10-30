"use client";

import Image from "next/image";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatShortDate } from "@/lib/format";
import type { Entry } from "@/lib/whats-new";

// The What's new page's releases, newest first: RELEASES_AT_ONCE at a time, then "Show N more" adds the next
// ones. The entries are already here (they live in the code), so nothing loads; a hidden release's
// screenshots aren't drawn, so they download only once shown.
export const RELEASES_AT_ONCE = 5;

export function ReleasesList({ releases }: { releases: { version: string; entries: Entry[] }[] }) {
  const [shown, setShown] = useState(RELEASES_AT_ONCE);
  const next = Math.min(RELEASES_AT_ONCE, releases.length - shown);
  const firstImageId = releases.flatMap((r) => r.entries).find((e) => e.image)?.id;
  return (
    <div className="space-y-16">
      {releases.slice(0, shown).map((r) => (
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
      {next > 0 && (
        <Button type="button" variant="outline" onClick={() => setShown((n) => n + RELEASES_AT_ONCE)}>
          Show {next} more
        </Button>
      )}
    </div>
  );
}
