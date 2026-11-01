import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { RecentItem } from "@/lib/recently";

const LABELS = { drive: "Last drive", charge: "Last charge" };

// The last day's drive and charge as one quiet line each closing the car's strip (NowStrip), under the battery, each opening its
// page: "Last drive 13.9 km · 8:18 AM to 8:50 AM". A charge read without a figure says only when it ended.
// "pending": the week's read (where they come from) is still loading, so a faint line holds one row's place,
// in the skeleton's own shape (app/page.tsx). Nothing when neither is recent.
export function Recently({ items }: { items: RecentItem[] | "pending" }) {
  if (items === "pending") {
    return (
      <p className="text-sm" aria-hidden="true">
        <span className="rounded-sm bg-muted text-transparent motion-safe:animate-pulse">Last drive 13.9 km · 8:18 AM to 8:50 AM</span>
      </p>
    );
  }
  return items.map((item) => {
    const text = [item.figure, item.when].filter(Boolean).join(" · ");
    // The chevron trails the last word, held to it, so a line that wraps on a phone ends with it.
    const cut = text.lastIndexOf(" ");
    return (
      <p key={item.href} className="text-sm tabular-nums">
        <Link
          href={item.href}
          prefetch={true}
          aria-label={[LABELS[item.kind], item.figure, item.when].filter(Boolean).join(", ")}
          className="group rounded-sm text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {LABELS[item.kind]}{" "}
          <span className="text-foreground">
            {text.slice(0, cut + 1)}
            <span className="whitespace-nowrap">
              {text.slice(cut + 1)}
              <ChevronRight aria-hidden="true" className="ml-1 inline-block size-3.5 align-[-0.15em] text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none" />
            </span>
          </span>
        </Link>
      </p>
    );
  });
}
