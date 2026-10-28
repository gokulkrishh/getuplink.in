import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";

// The class of every "more" link: a small ghost button with an arrow after it. The negative margins let its padding
// hang outside the text, so it sits flush right in a header row and adds no height to it.
export const moreLinkClass = buttonVariants({ variant: "ghost", size: "sm", className: "-my-1 -mr-2" });

// A link to somewhere with more (See charge, India rollout): the one look for them all.
export function MoreLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <Link href={href} prefetch={true} className={cn(moreLinkClass, className)}>
      {children}
      <ChevronRight aria-hidden="true" />
    </Link>
  );
}
