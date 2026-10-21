"use client";

import { DashRing } from "@/components/loading-ui/dash-ring";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// A plain link (the OAuth flow is a full-page redirect). While Tesla's page loads, a spinner shows.
export function SignInButton({
  size = "xl",
  label = "Sign in with Tesla",
  className,
}: {
  size?: "sm" | "xl";
  label?: string;
  className?: string;
}) {
  const [pending, setPending] = useState(false);
  return (
    <a
      href="/api/auth/connect"
      onClick={() => setPending(true)}
      aria-busy={pending}
      className={cn(buttonVariants({ size }), pending && "pointer-events-none", className)}
    >
      {label}
      {pending && <DashRing data-icon="inline-end" aria-hidden="true" />}
    </a>
  );
}
