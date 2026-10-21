import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { LoginError } from "./login-form";

export default function LoginPage() {
  return (
    <section className="m-auto flex w-full max-w-md flex-col items-center text-center">
      <Logo className="size-24" />
      <h1 className="mt-6 text-3xl font-black tracking-tight">Tesla Update Tracker</h1>
      <p className="mt-1 text-sm text-muted-foreground">Tesla software updates, tracked from India.</p>
      {/* Plain link: the OAuth flow is a full-page redirect. */}
      <a href="/api/auth/connect" className={buttonVariants({ className: "mt-10 h-10 w-full" })}>
        Sign in with Tesla
      </a>
      <Suspense>
        <div className="mt-4">
          <LoginError />
        </div>
      </Suspense>
    </section>
  );
}
