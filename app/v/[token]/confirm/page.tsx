import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { PlainPage } from "@/components/plain-page";
import { Button, buttonVariants } from "@/components/ui/button";
import { LINK_ENDED_PATH } from "@/lib/server/auth";
import { isUsed, openViewLink, ViewLinksUnavailable } from "@/lib/server/view-links";
import { cn } from "@/lib/utils";

// Where /v/<token> sends a browser that holds an owner's session (app/v/[token]/route.ts): opening the link
// would sign the owner out here, so it asks first. "Open as a guest" is a plain form POST back to the link,
// which checks it came from this host. An unknown, ended or used link goes to the ended page instead of
// asking. Nothing is changed until the POST.
export const metadata: Metadata = { title: "Open as a guest", robots: { index: false }, referrer: "no-referrer" };

// Read per request: the link's state decides the page, so nothing is sent before it is known.
export const instant = false;

async function openUnused(token: string): Promise<boolean> {
  await connection();
  try {
    const link = await openViewLink(token, Date.now());
    return Boolean(link && !isUsed(link));
  } catch (err) {
    if (!(err instanceof ViewLinksUnavailable)) console.error("Opening a view link failed:", (err as Error).message);
    return false;
  }
}

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await openUnused(token))) redirect(LINK_ENDED_PATH);
  return (
    <PlainPage home="/" title="Open as a guest?" intro="You'll be signed out of your own account in this browser.">
      <form method="post" action={`/v/${encodeURIComponent(token)}`} className="flex flex-wrap gap-2">
        <Button type="submit" size="lg">
          Open as a guest
        </Button>
        <Link href="/" className={cn(buttonVariants({ variant: "ghost", size: "lg" }))}>
          Cancel
        </Link>
      </form>
    </PlainPage>
  );
}
