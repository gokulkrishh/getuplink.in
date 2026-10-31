"use client";

import { LINK } from "@/lib/link-style";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState } from "react";
import { DashRing } from "@/components/loading-ui/dash-ring";
import { Button } from "@/components/ui/button";
import { guardForm } from "@/lib/offline";


function Submit({ pending }: { pending: boolean }) {
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
// Offline, the page stays and says so under the button (guardForm), and the box stays ticked: the form is
// sent from onSubmit, not its action prop, so React doesn't reset it when the action returns. The action prop
// stays for a tap before the page's script has loaded: React skips it once onSubmit prevents the default.
export function InviteSignIn({ action }: { action: (form: FormData) => Promise<void> }) {
  const [error, run, pending] = useActionState(guardForm(action), null);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        startTransition(() => run(form));
      }}
      className="space-y-4"
    >
      <label className="flex items-start gap-3 text-sm">
        {/* A native box, not shadcn's Checkbox: the form works before the page's script loads (see above),
            and Base UI's box can't be ticked until then. Native, the browser also says why an unticked form
            won't send. */}
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
      <Submit pending={pending} />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
