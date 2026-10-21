"use client";

import { ArrowRight, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// A plain link (the OAuth flow is a full-page redirect) that shows progress until Tesla's page loads.
// Both labels share one grid cell so the button keeps its width.
export function SignInButton({ className }: { className?: string }) {
  const [pending, setPending] = useState(false);
  return (
    <a
      href="/api/auth/connect"
      onClick={() => setPending(true)}
      aria-busy={pending}
      className={cn(buttonVariants({ size: "lg" }), "h-11 px-5", pending && "pointer-events-none", className)}
    >
      <span className="grid">
        <span className={cn("col-start-1 row-start-1", pending && "invisible")}>Sign in with Tesla</span>
        <span className={cn("col-start-1 row-start-1", !pending && "invisible")} aria-hidden={!pending}>
          Opening Tesla…
        </span>
      </span>
      {pending ? <LoaderCircle data-icon="inline-end" className="animate-spin" /> : <ArrowRight data-icon="inline-end" />}
    </a>
  );
}
