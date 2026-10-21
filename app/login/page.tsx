import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { LoginError } from "./login-form";

export default function LoginPage() {
  return (
    <section className="max-w-xs space-y-8">
      <h1 className="text-sm font-medium">India EV Update Tracker</h1>
      <div className="space-y-3">
        {/* Plain link: the OAuth flow is a full-page redirect. */}
        <a href="/api/auth/connect" className={buttonVariants({ className: "h-9 w-full" })}>
          Sign in with Tesla
        </a>
        <p className="text-xs text-muted-foreground">
          Only the Tesla account that first connected this dashboard can sign in.
        </p>
        <Suspense>
          <LoginError />
        </Suspense>
      </div>
    </section>
  );
}
