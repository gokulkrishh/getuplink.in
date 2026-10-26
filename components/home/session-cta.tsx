import { cookies } from "next/headers";
import { connection } from "next/server";
import { SignInButton } from "@/components/sign-in-button";
import { buttonVariants } from "@/components/ui/button";
import { isValidSession, SESSION_COOKIE } from "@/lib/session";
import { cn } from "@/lib/utils";

// Signed in: a link to the dashboard. Signed out: Sign in with Tesla. Reads the shared session cookie
// (see sessionCookieDomain), so it must render inside <Suspense>; the rest of the page stays static.
export async function SessionCta({
  size = "xl",
  label,
  className,
  dashboardOnly = false,
  signInLink = false,
}: {
  size?: "sm" | "xl";
  // Text for the signed-out button; defaults to "Sign in with Tesla".
  label?: string;
  className?: string;
  // Signed out, show nothing (sign-up is by invite link only).
  dashboardOnly?: boolean;
  // Signed out, a quiet "Sign in" text link instead, for accounts that already have access (the header).
  signInLink?: boolean;
}) {
  // The session check reads the clock, so render this only at request time, never ahead of it.
  await connection();
  const signedIn = await isValidSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (signedIn) {
    // /app goes to the dashboard (app.getuplink.in, or app.localhost locally); see proxy.ts.
    return (
      <a href="/app" className={cn(buttonVariants({ size }), className)}>
        Dashboard
      </a>
    );
  }
  if (signInLink) {
    return (
      <a href="/api/auth/connect" className={cn("text-muted-foreground transition-colors duration-150 hover:text-foreground", className)}>
        Sign in
      </a>
    );
  }
  return dashboardOnly ? null : <SignInButton size={size} label={label} className={className} />;
}
