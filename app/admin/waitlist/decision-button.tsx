"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";

// One decision on one account. `action` comes bound to both from the server (see decideAccount), which
// checks again that the request is the admin's. A refusal shows under the button.
export function DecisionButton({
  action,
  label,
  pendingLabel,
  variant = "outline",
  disabled = false,
}: {
  action: (previous: string | null, form: FormData) => Promise<string | null>;
  label: string;
  pendingLabel: string;
  variant?: "outline" | "default" | "destructive";
  disabled?: boolean;
}) {
  const [message, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <Button type="submit" variant={variant} size="sm" disabled={disabled || pending}>
        {pending ? pendingLabel : label}
      </Button>
      {message && (
        <p role="alert" className="max-w-[24ch] text-right text-xs text-destructive">
          {message}
        </p>
      )}
    </form>
  );
}
