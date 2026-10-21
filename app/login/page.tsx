import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <section className="max-w-xs space-y-8">
      <h1 className="text-sm font-medium">India EV Update Tracker</h1>
      <Suspense>
        <LoginForm />
      </Suspense>
    </section>
  );
}
