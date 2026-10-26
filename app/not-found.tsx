import type { Metadata } from "next";
import Link from "next/link";
import { PlainPage } from "@/components/plain-page";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found" };

// An address with no page behind it, in the same frame as the other plain pages instead of Next's default.
export default function NotFound() {
  return (
    <PlainPage title="Page not found" intro="There's no page at this address. The link may be old or mistyped.">
      <div>
        <Link href="/" className={buttonVariants({ size: "lg" })}>
          Go to Uplink
        </Link>
      </div>
    </PlainPage>
  );
}
