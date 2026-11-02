import { cookies } from "next/headers";
import { connection } from "next/server";
import { CONTACT_EMAIL } from "@/components/plain-page";
import { SignInButton } from "@/components/sign-in-button";
import { buttonVariants } from "@/components/ui/button";
import { signupMode } from "@/lib/server/env";
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
  visitor = false,
}: {
  size?: "sm" | "xl";
  // Text for the signed-out button; defaults to "Sign in with Tesla".
  label?: string;
  className?: string;
  // Signed out, show nothing (sign-up is by invite link only).
  dashboardOnly?: boolean;
  // Signed out, a plain "Sign in" button instead, for accounts that already have access (the header).
  signInLink?: boolean;
  // Signed out, the way in for someone new, as SIGNUP_MODE allows: with a waitlist, Join the waitlist (Sign in
  // with Tesla, which puts an unknown account on it); otherwise sign-up is by invite link only, so Ask for an
  // invite, an email to Uplink.
  visitor?: boolean;
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
      <a href="/api/auth/connect" className={cn(buttonVariants({ variant: "outline", size }), className)}>
        Sign in
      </a>
    );
  }
  if (visitor) {
    const mode = signupMode();
    if (mode === "waitlist" || mode === "open") return <SignInButton size={size} label="Join the waitlist" className={className} />;
    return (
      <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Uplink invite")}`} className={cn(buttonVariants({ size }), className)}>
        Ask for an invite
      </a>
    );
  }
  return dashboardOnly ? null : <SignInButton size={size} label={label} className={className} />;
}
