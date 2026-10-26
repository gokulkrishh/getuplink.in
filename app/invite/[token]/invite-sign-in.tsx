"use client";

import { ArrowRight } from "lucide-react";
import { useFormStatus } from "react-dom";
import { DashRing } from "@/components/loading-ui/dash-ring";
import { Button } from "@/components/ui/button";

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
export function InviteSignIn({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action}>
      <Submit />
    </form>
  );
}
