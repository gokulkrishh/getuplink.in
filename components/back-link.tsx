import { ChevronLeft } from "lucide-react";
import Link from "next/link";

// The way back from a page to the one it sits under, such as a trip to Trips.
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="-ml-1 mb-4 inline-flex min-h-9 items-center gap-1 pr-3 text-sm text-muted-foreground transition-colors hover:text-foreground">
      <ChevronLeft className="size-4" aria-hidden="true" />
      {label}
    </Link>
  );
}
