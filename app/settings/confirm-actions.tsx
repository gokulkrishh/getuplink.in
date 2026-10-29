"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NO_AUTOFILL } from "@/lib/no-autofill";
import { OFFLINE, orOffline } from "@/lib/offline";
import { deleteEverything, deleteWholeAccount, disconnect, signOutEverywhereWithError } from "./actions";
import { Row } from "./row";
import { PendingLabel } from "@/components/pending-label";

// Opening a confirm form moves focus into it; cancelling hands focus back to the button that opened it.
export function useAskingFocus(
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
    <Button ref={ref} type="submit" variant="destructive" disabled={pending} size="lg" className="relative">
      <PendingLabel pending={pending} label={children} pendingLabel={pendingLabel} />
    </Button>
  );
}

// A dropped connection rejects the action; show it inline instead of the full-page error.
function guarded<A extends unknown[]>(run: (...args: A) => Promise<string | null>) {
  return (...args: A) => orOffline(run(...args), OFFLINE);
}

// Two steps: the button asks, the confirmation repeats the consequence.
export function DisconnectTesla({ description }: { description: React.ReactNode }) {
  const [asking, setAsking] = useState(false);
  const [error, action] = useActionState(guarded(disconnect), null);
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
            Disconnect Tesla
          </Button>
        ) : null
      }
    >
      {asking && (
        <form action={action} className="mt-4 space-y-3 border-l-2 border-destructive pl-4 text-sm">
          <p className="font-medium">Disconnect your Tesla account?</p>
          <p className="text-muted-foreground">
            Uplink stops reading your car, removes your AI connectors and signs you out everywhere. Your history stays. To reconnect, sign in with
            Tesla again. To remove Uplink&apos;s key, open Controls, then Locks in your car.
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {/* Right-aligned with the action last; reversed so it stays first in tab order and gets focus on open. */}
          <div className="flex flex-row-reverse gap-2 pt-1">
            <Submit ref={first} pendingLabel="Disconnecting">Disconnect Tesla</Submit>
            <Button type="button" variant="ghost" size="lg" onClick={() => setAsking(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Row>
  );
}

type DeleteAction = (state: string | null, form: FormData) => Promise<string | null>;

// Irreversible, so the person types the confirm word.
function ConfirmDelete({
  id,
  title,
  description,
  question,
  consequence,
  word,
  submit,
  strong,
  deleteAction,
}: {
  id: string;
  title: string;
  description: string;
  question: string;
  consequence: React.ReactNode;
  word: string;
  submit: string;
  // Only the one that removes the account is the full red button; the other asks calmly.
  strong: boolean;
  deleteAction: DeleteAction;
}) {
  const [asking, setAsking] = useState(false);
  const [error, action] = useActionState(guarded(deleteAction), null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  // Controlled, so a failed action (a dropped connection) resets the form without clearing the typed word.
  const [typed, setTyped] = useState("");
  useAskingFocus(asking, input, trigger);
  const errorId = `${id}-error`;
  return (
    <Row
      title={title}
      description={description}
      control={
        !asking ? (
          <Button
            ref={trigger}
            type="button"
            variant={strong ? "destructive" : "outline"}
            size="lg"
            className={strong ? undefined : "border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"}
            onClick={() => setAsking(true)}>
            {submit}
          </Button>
        ) : null
      }
    >
      {asking && (
        <form action={action} className="mt-4 space-y-3 border-l-2 border-destructive pl-4 text-sm">
          <p className="font-medium">{question}</p>
          <p className="text-muted-foreground">{consequence}</p>
          <label className="block space-y-1.5">
            <span className="block text-sm text-muted-foreground">Type {word} to confirm</span>
            <Input ref={input} name="confirm" value={typed} onChange={(e) => setTyped(e.target.value)} {...NO_AUTOFILL} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder={word} className="h-9 max-sm:h-10 max-w-48" aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined} />
          </label>
          {error && (
            <p id={errorId} role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {/* Right-aligned with the action last; reversed so it stays first in tab order and gets focus on open. */}
          <div className="flex flex-row-reverse gap-2 pt-1">
            <Submit pendingLabel="Deleting">{submit}</Submit>
            <Button type="button" variant="ghost" size="lg" onClick={() => {
                setAsking(false);
                setTyped("");
              }}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Row>
  );
}

export function DeleteMyData() {
  return (
    <ConfirmDelete
      id="delete"
      title="Delete my data"
      description="Removes your car data and disconnects Tesla. You can sign in again."
      question="Delete all your data?"
      consequence={
        <>
          Your cars, history, invoices, places and check logs are deleted, Tesla is disconnected and you are signed out
          everywhere. This can&apos;t be undone. Your Uplink account stays, so you can sign in with Tesla again. Afterwards,
          remove Uplink&apos;s key: open Controls, then Locks in your car.
        </>
      }
      word="delete"
      submit="Delete my data"
      strong={false}
      deleteAction={deleteEverything}
    />
  );
}

export function DeleteAccount() {
  return (
    <ConfirmDelete
      id="delete-account"
      title="Delete account"
      description="Removes everything, including your Uplink account."
      question="Delete your Uplink account?"
      consequence={
        <>
          This deletes all your data and your Uplink account. It can&apos;t be undone. Uplink is invite-only, so you would
          need a new invite to come back. Afterwards, remove Uplink&apos;s key: open Controls, then Locks in your car.
        </>
      }
      word="delete account"
      submit="Delete account"
      strong
      deleteAction={deleteWholeAccount}
    />
  );
}

// Two steps, like Disconnect Tesla: the button asks, the confirmation says what happens. Its failure shows in the form.
export function SignOutEverywhere() {
  const [asking, setAsking] = useState(false);
  const [error, action] = useActionState(guarded(signOutEverywhereWithError), null);
  const trigger = useRef<HTMLButtonElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  useAskingFocus(asking, first, trigger);
  return (
    <Row
      title="Sign out everywhere"
      description="Signs out every device, including this one."
      control={
        !asking ? (
          <Button ref={trigger} type="button" variant="outline" size="lg" onClick={() => setAsking(true)}>
            Sign out everywhere
          </Button>
        ) : null
      }
    >
      {asking && (
        <form action={action} className="mt-4 space-y-3 border-l-2 border-destructive pl-4 text-sm">
          <p className="font-medium">Sign out everywhere?</p>
          <p className="text-muted-foreground">Uplink signs you out on every device, including this one. You can sign in again with Tesla.</p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {/* Right-aligned with the action last; reversed so it stays first in tab order and gets focus on open. */}
          <div className="flex flex-row-reverse gap-2 pt-1">
            <Submit ref={first} pendingLabel="Signing out">Sign out everywhere</Submit>
            <Button type="button" variant="ghost" size="lg" onClick={() => setAsking(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Row>
  );
}
