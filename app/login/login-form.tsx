"use client";

import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { login } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const next = useSearchParams().get("next") ?? "/";
  const [error, action, pending] = useActionState(login, null);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <Input
        type="password"
        name="passphrase"
        placeholder="Passphrase"
        autoComplete="current-password"
        autoFocus
        required
        className="h-9"
        aria-invalid={error ? true : undefined}
      />
      <Button type="submit" disabled={pending} className="h-9 w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
