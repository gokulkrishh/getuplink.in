import { cn } from "@/lib/utils";

// Sign-up is by invite link only, so the home page has no Sign in with Tesla button: a calm note instead,
// with a quiet way in for accounts that already have access. Static, so it can sit in the page's shell.
export function InviteOnly({ className }: { className?: string }) {
  return (
    <div className={cn("max-w-md border-l-2 pl-4", className)}>
      <p className="text-base font-medium">Uplink is invite-only for now.</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Already have access?{" "}
        <a href="/api/auth/connect" className="underline decoration-border underline-offset-4 hover:text-foreground hover:decoration-foreground">
          Sign in
        </a>
      </p>
    </div>
  );
}
