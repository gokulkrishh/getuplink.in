"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { DashRing } from "@/components/loading-ui/dash-ring";
import { Button } from "@/components/ui/button";

const LINK = "underline decoration-border underline-offset-4 hover:decoration-foreground";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="xl" disabled={pending} aria-busy={pending}>
      Sign in with Tesla
      {pending ? <DashRing data-icon="inline-end" aria-hidden="true" /> : <ArrowRight data-icon="inline-end" aria-hidden="true" />}
    </Button>
  );
}

// The invite's own sign-in: a form, so the token travels in the action (bound on the server), not in a URL.
// The box is the owner's own consent before Tesla's scope screen (Tesla Fleet API Agreement 9.3.2, DPDP Act
// s. 6(1)); the action checks it again, since a form can be posted without it. See docs/legal-review.md.
export function InviteSignIn({ action }: { action: (form: FormData) => Promise<void> }) {
  return (
    <form action={action} className="space-y-4">
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="agree" value="yes" required className="mt-0.5 size-4 shrink-0 accent-foreground" />
        <span>
          I&apos;m 18 or over, and I agree to the{" "}
          <Link href="/terms" className={LINK} target="_blank">
            Terms
          </Link>{" "}
          and the{" "}
          <Link href="/privacy" className={LINK} target="_blank">
            Privacy
          </Link>{" "}
          page.
        </span>
      </label>
      <Submit />
    </form>
  );
}
