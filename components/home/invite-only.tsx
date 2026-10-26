import { cn } from "@/lib/utils";

// Sign-up is by invite link only: a small badge beside "See the demo" says so. Signing in for accounts that
// already have access is the header's "Sign in" link. Static, so it can sit in the page's shell.
export function InviteOnly({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex h-7 items-center rounded-full border px-3 text-xs text-muted-foreground", className)}>
      Invite only
    </span>
  );
}
