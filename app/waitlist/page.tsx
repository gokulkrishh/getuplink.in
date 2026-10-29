import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, PlainPage } from "@/components/plain-page";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Waitlist", robots: { index: false } };

// Where a Tesla sign-in lands while its account waits for approval. Static: it says the same to everyone,
// so a crafted link can't put anything on it.
export default function Waitlist() {
  return (
    <PlainPage title="You're on the waitlist" intro="Uplink is invite only for now. Your Tesla account is waiting for approval." home="/home">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <a href="/api/auth/connect" className={buttonVariants({ size: "lg" })}>
            Sign in to check again
          </a>
          <Link href="/home" className={buttonVariants({ variant: "outline", size: "lg" })}>
            Back to Uplink
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          To leave the waitlist, email{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="underline decoration-muted-foreground/60 underline-offset-4 hover:text-foreground hover:decoration-foreground"
          >
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </div>
    </PlainPage>
  );
}
