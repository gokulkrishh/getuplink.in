import { CONTACT_EMAIL } from "@/components/plain-page";
import { cn } from "@/lib/utils";

// How to get in, as plain text so it never reads as a button: sign-up is by invite link only. Static, so it
// can sit in the page's shell.
export function InviteOnly({ className }: { className?: string }) {
  return (
    <p className={cn("max-w-md text-sm text-muted-foreground", className)}>
      Invite only for now. No invite yet? Email{" "}
      <a href={`mailto:${CONTACT_EMAIL}`} className="underline decoration-border underline-offset-4 hover:text-foreground hover:decoration-foreground">
        {CONTACT_EMAIL}
      </a>{" "}
      to ask for one. Signing in without an invite puts you on the waitlist.
    </p>
  );
}
