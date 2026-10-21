import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { LoginError } from "./login-form";

export default function LoginPage() {
  return (
    <section className="m-auto flex w-full max-w-xs flex-col items-center text-center">
      <Logo className="size-10" />
      <h1 className="mt-6 text-lg font-medium tracking-tight">India EV Update Tracker</h1>
      <p className="mt-1 text-sm text-muted-foreground">Tesla software updates, tracked from India.</p>
      {/* Plain link: the OAuth flow is a full-page redirect. */}
      <a href="/api/auth/connect" className={buttonVariants({ className: "mt-10 h-10 w-full" })}>
        Sign in with Tesla
      </a>
      <p className="mt-4 text-xs text-faint">Only the Tesla account that first connected this dashboard can sign in.</p>
      <Suspense>
        <div className="mt-4">
          <LoginError />
        </div>
      </Suspense>
    </section>
  );
}
