"use client";

import { ArrowRight } from "lucide-react";
import { DashRing } from "@/components/loading-ui/dash-ring";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// A plain link (the OAuth flow is a full-page redirect). While Tesla's page loads, the arrow turns into a spinner.
export function SignInButton({ size = "xl", className }: { size?: "sm" | "xl"; className?: string }) {
  const [pending, setPending] = useState(false);
  return (
    <a
      href="/api/auth/connect"
      onClick={() => setPending(true)}
      aria-busy={pending}
      className={cn(buttonVariants({ size }), pending && "pointer-events-none", className)}
    >
      Sign in with Tesla
      {pending ? <DashRing data-icon="inline-end" aria-hidden="true" /> : <ArrowRight data-icon="inline-end" />}
    </a>
  );
}
