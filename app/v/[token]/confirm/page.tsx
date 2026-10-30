import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PlainPage } from "@/components/plain-page";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Where /v/<token> sends a browser that holds an owner's session (app/v/[token]/route.ts): opening the link
// would sign the owner out here, so it asks first. "Open as a guest" is a plain form POST back to the link,
// which checks it came from this host. Nothing is read or changed until then.
export const metadata: Metadata = { title: "Open as a guest", robots: { index: false }, referrer: "no-referrer" };

const TITLE = "Open as a guest?";
const INTRO = "You'll be signed out of your own account in this browser.";

function Actions({ action }: { action?: string }) {
  return (
    <form method="post" action={action} className="flex flex-wrap gap-2">
      <Button type="submit" size="lg" disabled={!action}>
        Open as a guest
      </Button>
      <Link href="/" className={cn(buttonVariants({ variant: "ghost", size: "lg" }))}>
        Cancel
      </Link>
    </form>
  );
}

async function TokenActions({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <Actions action={`/v/${encodeURIComponent(token)}`} />;
}

export default function Page({ params }: { params: Promise<{ token: string }> }) {
  return (
    <PlainPage home="/" title={TITLE} intro={INTRO}>
      {/* The same buttons, disabled, while the address is read: nothing moves when they turn on. */}
      <Suspense fallback={<Actions />}>
        <TokenActions params={params} />
      </Suspense>
    </PlainPage>
  );
}
