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
  return items.map((item) => (
    <p key={item.href} className="text-sm tabular-nums">
      <Link
        href={item.href}
        prefetch={true}
        aria-label={[LABELS[item.kind], item.figure, item.when].filter(Boolean).join(", ")}
        className="group inline-flex max-w-full items-baseline gap-1 rounded-sm text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span className="min-w-0">
          {LABELS[item.kind]} <span className="text-foreground">{[item.figure, item.when].filter(Boolean).join(" · ")}</span>
        </span>
        <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 self-center transition-transform duration-150 group-hover:translate-x-0.5" />
      </Link>
    </p>
  ));
}
