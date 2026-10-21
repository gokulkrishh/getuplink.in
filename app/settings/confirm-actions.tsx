"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteEverything, deleteImportedUpdates, disconnect, signOutEverywhereWithError } from "./actions";
import { Row } from "./row";

// Opening a confirm form moves focus into it; cancelling hands focus back to the button that opened it.
function useAskingFocus(
  asking: boolean,
  first: React.RefObject<HTMLElement | null>,
  trigger: React.RefObject<HTMLElement | null>,
) {
  const wasAsking = useRef(false);
  useEffect(() => {
    if (asking) first.current?.focus();
    else if (wasAsking.current) trigger.current?.focus();
    wasAsking.current = asking;
  }, [asking, first, trigger]);
}

function Submit({ children, pendingLabel, ref }: { children: string; pendingLabel: string; ref?: React.Ref<HTMLButtonElement> }) {
  const { pending } = useFormStatus();
  return (
    <Button ref={ref} type="submit" variant="destructive" disabled={pending} size="lg">
      {pending ? pendingLabel : children}
    </Button>
  );
}

// Two steps: the button asks, the confirmation repeats the consequence.
export function DisconnectTesla({ description }: { description: string }) {
  const [asking, setAsking] = useState(false);
  const [error, action] = useActionState(disconnect, null);
  const trigger = useRef<HTMLButtonElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  useAskingFocus(asking, first, trigger);
  return (
    <Row
      title="Tesla account"
      description={description}
      control={
        !asking ? (
          <Button ref={trigger} type="button" variant="outline" size="lg" onClick={() => setAsking(true)}>
            Disconnect
          </Button>
        ) : null
      }
    >
      {asking && (
        <form action={action} className="mt-4 space-y-3 border-l-2 border-destructive pl-4 text-sm">
          <p className="font-medium">Disconnect your Tesla account?</p>
          <p className="text-muted-foreground">
            Uplink stops checking your car, stops your car streaming to Uplink and signs you out on every device. Your
            history stays. Remove Uplink&apos;s key in your car&apos;s Locks settings. Sign in with Tesla to reconnect.
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <Submit ref={first} pendingLabel="Disconnecting…">Disconnect Tesla</Submit>
            <Button type="button" variant="ghost" size="lg" onClick={() => setAsking(false)}>
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
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useAskingFocus(asking, input, trigger);
  return (
    <Row
      title="Delete my data"
      description="Permanently deletes your vehicles, history, streamed readings, check logs and Tesla connection."
      control={
        !asking ? (
          <Button ref={trigger} type="button" variant="destructive" size="lg" onClick={() => setAsking(true)}>
            Delete
          </Button>
        ) : null
      }
    >
      {asking && (
        <form action={action} className="mt-4 space-y-3 border-l-2 border-destructive pl-4 text-sm">
          <p className="font-medium">Delete all your data?</p>
          <p className="text-muted-foreground">
            This permanently deletes your vehicles, history, streamed readings, check logs and Tesla connection, stops your
            car streaming to Uplink and signs you out on every device. It can&apos;t be undone. You stay the owner: only
            your Tesla account can sign in again. Then remove Uplink&apos;s key in your car&apos;s Locks settings.
          </p>
          <label className="block space-y-1.5">
            <span className="block text-xs text-muted-foreground">Type delete to confirm</span>
            <Input ref={input} name="confirm" autoComplete="off" placeholder="delete" className="h-9 max-w-48" aria-invalid={error ? true : undefined} aria-describedby={error ? "delete-error" : undefined} />
          </label>
          {error && (
            <p id="delete-error" role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <Submit pendingLabel="Deleting…">Delete my data</Submit>
            <Button type="button" variant="ghost" size="lg" onClick={() => setAsking(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Row>
  );
}

// "Sign out everywhere" with its failure shown next to the button.
export function SignOutEverywhere() {
  const [error, action] = useActionState(signOutEverywhereWithError, null);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <Button type="submit" variant="outline" size="lg">
        Sign out everywhere
      </Button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}

// Removes only what was imported; updates Uplink tracked itself stay.
export function DeleteImportedUpdates({ count }: { count: number }) {
  const [asking, setAsking] = useState(false);
  const [error, action] = useActionState(deleteImportedUpdates, null);
  const trigger = useRef<HTMLButtonElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  useAskingFocus(asking, first, trigger);
  const noun = count === 1 ? "update" : "updates";
  return (
    <Row
      title="Imported updates"
      description={`${count} imported ${noun} in your history.`}
      control={
        !asking ? (
          <Button ref={trigger} type="button" variant="outline" size="lg" onClick={() => setAsking(true)}>
            Delete imported updates
          </Button>
        ) : null
      }
    >
      {asking && (
        <form action={action} className="mt-4 space-y-3 border-l-2 border-destructive pl-4 text-sm">
          <p className="font-medium">Delete {count} imported {noun}?</p>
          <p className="text-muted-foreground">
            This removes only the updates you imported. The updates Uplink tracked itself stay. You can import a list again.
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <Submit ref={first} pendingLabel="Deleting…">Delete imported updates</Submit>
            <Button type="button" variant="ghost" size="lg" onClick={() => setAsking(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Row>
  );
}
