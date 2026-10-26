import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";
import { PlainPage } from "@/components/plain-page";
import { allowInviteLookup, clientAddress, type InviteLookup, lookupInvite } from "@/lib/server/invites";
import { startInviteSignIn } from "./actions";
import { InviteSignIn } from "./invite-sign-in";

// The token never leaves this page in a Referer (Tesla's sign-in page is next), and it's never indexed.
export const metadata: Metadata = { title: "Invite · Uplink", robots: { index: false }, referrer: "no-referrer" };

// Read per request: the link's state and the caller's address.
export const instant = false;

const MESSAGES: Record<Exclude<InviteLookup, "unused">, { title: string; intro: string }> = {
  used: { title: "This invite link was already used", intro: "Each link works once. Ask for a new one." },
  expired: { title: "This invite link has expired", intro: "Links last a day. Ask for a new one." },
  revoked: { title: "This invite link doesn't work", intro: "Ask whoever sent it for a new one." },
  unknown: { title: "This invite link doesn't work", intro: "Check the link, or ask for a new one." },
  unavailable: { title: "This invite link doesn't work", intro: "Check the link, or ask for a new one." },
};

const LIMITED = { title: "Too many tries", intro: "Wait a few minutes, then open the link again." };

async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const now = Date.now();
  if (!allowInviteLookup(clientAddress(await headers()), now)) return <PlainPage home="/home" {...LIMITED} />;
  const state = await lookupInvite(token, now);
  if (state !== "unused") return <PlainPage home="/home" {...MESSAGES[state]} />;
  return (
    <PlainPage
      home="/home"
      title="You're invited to Uplink"
      intro="Your Tesla's software updates, charging and drives, in one place. Read-only: it never wakes, unlocks or drives the car."
    >
      <div className="space-y-4">
        <InviteSignIn action={startInviteSignIn.bind(null, token)} />
        <p className="text-sm text-muted-foreground">Sign in with the Tesla account that has the invited car. The link works once.</p>
      </div>
    </PlainPage>
  );
}

export default function Page({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Suspense fallback={<PlainPage home="/home" title="You're invited to Uplink" intro="Checking the link…" />}>
      <Invite params={params} />
    </Suspense>
  );
}
