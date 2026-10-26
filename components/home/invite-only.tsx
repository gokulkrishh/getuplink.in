import { LockKeyhole } from "lucide-react";
import { cn } from "@/lib/utils";

// Sign-up is by invite link only: a quiet note beside "See the demo" says so, styled as text rather than a
// control so it never reads as a button. Signing in for accounts that already have access is the header's
// "Sign in" link. Static, so it can sit in the page's shell.
export function InviteOnly({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm text-muted-foreground", className)}>
      <LockKeyhole aria-hidden className="size-3.5" />
      Invite only for now
    </span>
  );
}
