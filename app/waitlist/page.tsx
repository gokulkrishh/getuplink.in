import type { Metadata } from "next";
import Link from "next/link";
import { PlainPage } from "@/components/plain-page";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Waitlist", robots: { index: false } };

// Where a Tesla sign-in lands while its account waits for approval. Static: it says the same to everyone,
// so a crafted link can't put anything on it.
export default function Waitlist() {
  return (
    <PlainPage title="You're on the waitlist" intro="Sign in again later to check." home="/home">
      <div>
        <Link href="/home" className={buttonVariants({ variant: "outline", size: "lg" })}>
          Back to Uplink
        </Link>
      </div>
    </PlainPage>
  );
}
