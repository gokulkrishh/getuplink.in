"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteEverything, disconnect } from "./actions";

function Submit({ children, pendingLabel }: { children: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="destructive" disabled={pending} className="h-9 px-4">
      {pending ? pendingLabel : children}
    </Button>
  );
}

// Two steps: the button asks, the confirmation repeats the consequence.
export function DisconnectTesla() {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button type="button" variant="outline" className="h-9 px-4" onClick={() => setAsking(true)}>
        Disconnect Tesla
      </Button>
    );
  }
  return (
    <form action={disconnect} className="space-y-3 border-l-2 border-destructive pl-4">
      <p className="font-medium">Disconnect your Tesla account?</p>
      <p className="text-muted-foreground">
        Uplink stops checking your car and signs you out on every device. Your history stays. Sign in with Tesla to
        reconnect.
      </p>
      <div className="flex gap-2">
        <Submit pendingLabel="Disconnecting…">Disconnect Tesla</Submit>
        <Button type="button" variant="ghost" className="h-9 px-4" onClick={() => setAsking(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// Irreversible, so the person types "delete".
export function DeleteMyData() {
  const [asking, setAsking] = useState(false);
  const [error, action] = useActionState(deleteEverything, null);
  if (!asking) {
    return (
      <Button type="button" variant="destructive" className="h-9 px-4 text-destructive" onClick={() => setAsking(true)}>
        Delete my data
      </Button>
    );
  }
  return (
    <form action={action} className="space-y-3 border-l-2 border-destructive pl-4">
      <p className="font-medium">Delete all your data?</p>
      <p className="text-muted-foreground">
        This permanently deletes your vehicles, version history, check logs and Tesla connection, and signs you out on
        every device. It can&apos;t be undone. You stay the owner: only your Tesla account can sign in again.
      </p>
      <label className="block space-y-1.5">
        <span className="text-xs text-muted-foreground">Type delete to confirm</span>
        <Input name="confirm" autoComplete="off" autoFocus placeholder="delete" className="h-9 max-w-48" aria-invalid={error ? true : undefined} />
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Submit pendingLabel="Deleting…">Delete my data</Submit>
        <Button type="button" variant="ghost" className="h-9 px-4" onClick={() => setAsking(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
