import { cookies } from "next/headers";
import { SignInButton } from "@/components/sign-in-button";
import { buttonVariants } from "@/components/ui/button";
import { isValidSession, SESSION_COOKIE } from "@/lib/session";
import { cn } from "@/lib/utils";

// Signed in: a link to the dashboard. Signed out: Sign in with Tesla. Reads the shared session cookie
// (see sessionCookieDomain), so it must render inside <Suspense>; the rest of the page stays static.
export async function SessionCta({ size = "xl", className }: { size?: "sm" | "xl"; className?: string }) {
  const signedIn = await isValidSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (signedIn) {
    // /app goes to the dashboard (app.getuplink.in, or app.localhost locally); see proxy.ts.
    return (
      <a href="/app" className={cn(buttonVariants({ size }), className)}>
        Dashboard
      </a>
    );
  }
  return <SignInButton size={size} className={className} />;
}
