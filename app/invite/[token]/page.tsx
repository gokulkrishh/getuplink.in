import type { Metadata } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { CONTACT_EMAIL, PlainPage } from "@/components/plain-page";
import { buttonVariants } from "@/components/ui/button";
import { allowInviteLookup, clientAddress, type InviteLookup, lookupInvite } from "@/lib/server/invites";
import { startInviteSignIn } from "./actions";
import { InviteSignIn } from "./invite-sign-in";

// The token never leaves this page in a Referer (Tesla's sign-in page is next), and it's never indexed.
export const metadata: Metadata = { title: "Invite", robots: { index: false }, referrer: "no-referrer" };

// Read per request: the link's state and the caller's address.
export const instant = false;

const MESSAGES: Record<Exclude<InviteLookup, "unused">, { title: string; intro: string }> = {
  used: { title: "This invite link was already used", intro: "Each link works once. Email us for a new one." },
  expired: { title: "This invite link has expired", intro: "Links last a day. Email us for a new one." },
  revoked: { title: "This invite link doesn't work", intro: "Ask whoever sent it for a new one, or email us." },
  unknown: { title: "This invite link doesn't work", intro: "Check the link, or email us for a new one." },
  unavailable: { title: "This invite link doesn't work", intro: "Check the link, or email us for a new one." },
};

const LIMITED = { title: "Too many tries", intro: "Wait a few minutes, then open the link again." };

async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const address = clientAddress(await headers());
  // The link's state reads the clock: only ever at request time.
  await connection();
  const now = Date.now();
  if (!allowInviteLookup(address, now)) return <PlainPage home="/home" {...LIMITED} />;
  const state = await lookupInvite(token, now);
  if (state !== "unused") {
    return (
      <PlainPage home="/home" {...MESSAGES[state]}>
        <div>
          <a href={`mailto:${CONTACT_EMAIL}?subject=Uplink%20invite`} className={buttonVariants({ size: "lg" })}>
            Email {CONTACT_EMAIL}
          </a>
        </div>
      </PlainPage>
    );
  }
  return (
    <PlainPage
      home="/home"
      title="You're invited to Uplink"
      intro="Your Tesla's software updates, charging and drives, in one place. Read-only: it never wakes, unlocks or drives the car."
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Signing in lets Uplink read your car&apos;s software, charging, battery and drives, and its location if you
          allow it. You can untick location on Tesla&apos;s page, and delete everything in Settings.
        </p>
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
