"use client";

import { ArrowRight, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// A plain link (the OAuth flow is a full-page redirect). While Tesla's page loads, the arrow turns into a spinner.
export function SignInButton({ className }: { className?: string }) {
  const [pending, setPending] = useState(false);
  return (
    <a
      href="/api/auth/connect"
      onClick={() => setPending(true)}
      aria-busy={pending}
      className={cn(buttonVariants({ size: "lg" }), "h-11 px-5", pending && "pointer-events-none", className)}
    >
      Sign in with Tesla
      {pending ? <LoaderCircle data-icon="inline-end" className="animate-spin" /> : <ArrowRight data-icon="inline-end" />}
    </a>
  );
}
