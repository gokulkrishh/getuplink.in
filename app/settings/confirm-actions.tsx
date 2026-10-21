"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteEverything, disconnect } from "./actions";
import { Row } from "./row";

function Submit({ children, pendingLabel }: { children: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="destructive" disabled={pending} className="h-9 px-4">
      {pending ? pendingLabel : children}
    </Button>
  );
}

// Two steps: the button asks, the confirmation repeats the consequence.
export function DisconnectTesla({ description }: { description: string }) {
  const [asking, setAsking] = useState(false);
  return (
    <Row
      title="Tesla account"
      description={description}
      control={
        !asking ? (
          <Button type="button" variant="outline" className="h-9 px-4" onClick={() => setAsking(true)}>
            Disconnect
          </Button>
        ) : null
      }
    >
      {asking && (
        <form action={disconnect} className="mt-4 space-y-3 border-l-2 border-destructive pl-4 text-sm">
          <p className="font-medium">Disconnect your Tesla account?</p>
          <p className="text-muted-foreground">
            Uplink stops checking your car and signs you out on every device. Your history stays. Sign in with Tesla to
            reconnect.
          </p>
          <div className="flex gap-2 pt-1">
            <Submit pendingLabel="Disconnecting…">Disconnect Tesla</Submit>
            <Button type="button" variant="ghost" className="h-9 px-4" onClick={() => setAsking(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Row>
  );
}

// Irreversible, so the person types "delete".
export function DeleteMyData() {
  const [asking, setAsking] = useState(false);
  const [error, action] = useActionState(deleteEverything, null);
  return (
    <Row
      title="Delete my data"
      description="Permanently deletes your vehicles, version history, check logs and Tesla connection."
      control={
        !asking ? (
          <Button type="button" variant="destructive" className="h-9 px-4" onClick={() => setAsking(true)}>
            Delete
          </Button>
        ) : null
      }
    >
      {asking && (
        <form action={action} className="mt-4 space-y-3 border-l-2 border-destructive pl-4 text-sm">
          <p className="font-medium">Delete all your data?</p>
          <p className="text-muted-foreground">
            This permanently deletes your vehicles, version history, check logs and Tesla connection, and signs you out on
            every device. It can&apos;t be undone. You stay the owner: only your Tesla account can sign in again.
          </p>
          <label className="block space-y-1.5">
            <span className="block text-xs text-muted-foreground">Type delete to confirm</span>
            <Input name="confirm" autoComplete="off" autoFocus placeholder="delete" className="h-9 max-w-48" aria-invalid={error ? true : undefined} />
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2 pt-1">
            <Submit pendingLabel="Deleting…">Delete my data</Submit>
            <Button type="button" variant="ghost" className="h-9 px-4" onClick={() => setAsking(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Row>
  );
}
