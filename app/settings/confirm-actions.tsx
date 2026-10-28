"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NO_AUTOFILL } from "@/lib/no-autofill";
import { deleteEverything, deleteWholeAccount, disconnect, signOutEverywhereWithError } from "./actions";
import { Row } from "./row";

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
            Uplink stops reading your car and signs you out everywhere. Your history stays. To reconnect, sign in with
            Tesla again. To remove the key, open Locks in your car&apos;s settings.
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {/* Right-aligned with the action last; reversed so it stays first in tab order and gets focus on open. */}
          <div className="flex flex-row-reverse gap-2 pt-1">
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
  deleteAction,
}: {
  id: string;
  title: string;
  description: string;
  question: string;
  consequence: React.ReactNode;
  word: string;
  submit: string;
  deleteAction: DeleteAction;
}) {
  const [asking, setAsking] = useState(false);
  const [error, action] = useActionState(deleteAction, null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useAskingFocus(asking, input, trigger);
  const errorId = `${id}-error`;
  return (
    <Row
      title={title}
      description={description}
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
          <p className="font-medium">{question}</p>
          <p className="text-muted-foreground">{consequence}</p>
          <label className="block space-y-1.5">
            <span className="block text-sm text-muted-foreground">Type {word} to confirm</span>
            <Input ref={input} name="confirm" {...NO_AUTOFILL} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder={word} className="h-9 max-sm:h-10 max-w-48" aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined} />
          </label>
          {error && (
            <p id={errorId} role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {/* Right-aligned with the action last; reversed so it stays first in tab order and gets focus on open. */}
          <div className="flex flex-row-reverse gap-2 pt-1">
            <Submit pendingLabel="Deleting…">{submit}</Submit>
            <Button type="button" variant="ghost" size="lg" onClick={() => setAsking(false)}>
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
      description="Deletes everything Uplink holds about your cars and disconnects Tesla."
      question="Delete all your data?"
      consequence={
        <>
          Your cars, history, invoices, places and check logs are deleted, Tesla is disconnected and you are signed out
          everywhere. This can&apos;t be undone. Your Uplink account stays, so you can sign in with Tesla again. Afterwards,
          remove Uplink&apos;s key in your car&apos;s Locks settings.
        </>
      }
      word="delete"
      submit="Delete my data"
      deleteAction={deleteEverything}
    />
  );
}

export function DeleteAccount() {
  return (
    <ConfirmDelete
      id="delete-account"
      title="Delete account"
      description="Deletes all your data and your Uplink account."
      question="Delete your Uplink account?"
      consequence={
        <>
          This deletes all your data and your Uplink account. It can&apos;t be undone. Uplink is invite-only, so you would
          need a new invite to come back. Afterwards, remove Uplink&apos;s key in your car&apos;s Locks settings.
        </>
      }
      word="delete account"
      submit="Delete account"
      deleteAction={deleteWholeAccount}
    />
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
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
