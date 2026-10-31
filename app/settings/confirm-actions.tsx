"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertDialog, AlertDialogClose, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NO_AUTOFILL } from "@/lib/no-autofill";
import { OFFLINE, orOffline } from "@/lib/offline";
import { deleteEverything, deleteWholeAccount, disconnect, signOutEverywhereWithError } from "./actions";
import { Row } from "./row";
import { PendingLabel } from "@/components/pending-label";

function Submit({ children, pendingLabel }: { children: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="destructive" disabled={pending} size="lg" className="relative">
      <PendingLabel pending={pending} label={children} pendingLabel={pendingLabel} />
    </Button>
  );
}

// Cancel closes the dialog; it waits while the action runs.
function Cancel() {
  const { pending } = useFormStatus();
  return <AlertDialogClose render={<Button type="button" variant="ghost" size="lg" disabled={pending} />}>Cancel</AlertDialogClose>;
}

// A dropped connection rejects the action; show it inline instead of the full-page error.
function guarded<A extends unknown[]>(run: (...args: A) => Promise<string | null>) {
  return (...args: A) => orOffline(run(...args), OFFLINE);
}

// The body of a confirmation, mounted only while its dialog is open, so the error and the typed word start
// fresh each time. Cancel first, the action last. The dialog stays open while the action runs.
function ConfirmBody({
  title,
  children,
  submit,
  pendingLabel,
  run,
  word,
  initialFocus,
  busy,
}: {
  title: string;
  children: React.ReactNode;
  submit: string;
  pendingLabel: string;
  run: (state: string | null, form: FormData) => Promise<string | null>;
  word?: string;
  initialFocus?: React.RefObject<HTMLInputElement | null>;
  // Set while the action runs, so the dialog above can refuse to close (Escape, a tap outside).
  busy: React.RefObject<boolean>;
}) {
  const [error, action, pending] = useActionState(guarded(run), null);
  useEffect(() => {
    busy.current = pending;
    return () => {
      busy.current = false;
    };
  }, [busy, pending]);
  // Controlled, so a failed action (a dropped connection) resets the form without clearing the typed word.
  const [typed, setTyped] = useState("");
  return (
    <AlertDialogContent initialFocus={initialFocus} keyboard={Boolean(word)}>
      <form action={action} className="grid gap-3">
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{children}</AlertDialogDescription>
        {word && (
          <label className="block space-y-1.5">
            <span className="block text-sm text-muted-foreground">Type {word} to confirm</span>
            <Input ref={initialFocus} name="confirm" value={typed} onChange={(e) => setTyped(e.target.value)} {...NO_AUTOFILL} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder={word} className="w-full" aria-invalid={error ? true : undefined} aria-describedby={error ? "confirm-error" : undefined} />
          </label>
        )}
        {error && (
          <p id="confirm-error" role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <Cancel />
          <Submit pendingLabel={pendingLabel}>{submit}</Submit>
        </AlertDialogFooter>
      </form>
    </AlertDialogContent>
  );
}

// Two steps: the button asks, the dialog repeats the consequence.
export function DisconnectTesla({ description }: { description: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const busy = useRef(false);
  return (
    <Row
      title="Tesla account"
      description={description}
      control={
        <Button type="button" variant="outline" size="lg" onClick={() => setOpen(true)}>
          Disconnect Tesla
        </Button>
      }
    >
      <AlertDialog open={open} onOpenChange={(next) => !busy.current && setOpen(next)}>
        <ConfirmBody busy={busy} title="Disconnect your Tesla account?" submit="Disconnect Tesla" pendingLabel="Disconnecting" run={disconnect}>
          Uplink stops reading your car, removes your AI connectors and signs you out everywhere. Your guest links stop working. Your history stays. To reconnect, sign in with
          Tesla again. To remove Uplink&apos;s key, open Controls &gt; Locks in your car.
        </ConfirmBody>
      </AlertDialog>
    </Row>
  );
}

type DeleteAction = (state: string | null, form: FormData) => Promise<string | null>;

// Irreversible, so the person types the confirm word.
function ConfirmDelete({
  title,
  description,
  question,
  consequence,
  word,
  submit,
  strong,
  deleteAction,
}: {
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
  const [open, setOpen] = useState(false);
  const busy = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <Row
      title={title}
      description={description}
      control={
        <Button
          type="button"
          variant={strong ? "destructive" : "outline"}
          size="lg"
          className={strong ? undefined : "border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"}
          onClick={() => setOpen(true)}>
          {submit}
        </Button>
      }
    >
      <AlertDialog open={open} onOpenChange={(next) => !busy.current && setOpen(next)}>
        <ConfirmBody busy={busy} title={question} submit={submit} pendingLabel="Deleting" run={deleteAction} word={word} initialFocus={input}>
          {consequence}
        </ConfirmBody>
      </AlertDialog>
    </Row>
  );
}
export function DeleteMyData() {
  return (
    <ConfirmDelete
      title="Delete my data"
      description="Removes your car data and disconnects Tesla. You can sign in again."
      question="Delete all your data?"
      consequence={
        <>
          Your cars, history, invoices, places and check logs are deleted, Tesla is disconnected and you are signed out
          everywhere. Your guest links stop working. This can&apos;t be undone. Your Uplink account stays, so you can sign in with Tesla again. Afterwards,
          remove Uplink&apos;s key: open Controls &gt; Locks in your car.
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
      title="Delete account"
      description="Removes everything, including your Uplink account."
      question="Delete your Uplink account?"
      consequence={
        <>
          This deletes all your data and your Uplink account. It can&apos;t be undone. Uplink is invite-only, so you would
          need a new invite to come back. Afterwards, remove Uplink&apos;s key: open Controls &gt; Locks in your car.
        </>
      }
      word="delete account"
      submit="Delete account"
      strong
      deleteAction={deleteWholeAccount}
    />
  );
}

// Two steps, like Disconnect Tesla: the button asks, the dialog says what happens. Its failure shows in the dialog.
export function SignOutEverywhere() {
  const [open, setOpen] = useState(false);
  const busy = useRef(false);
  return (
    <Row
      title="Sign out everywhere"
      description="Signs out every device, including this one."
      control={
        <Button type="button" variant="outline" size="lg" onClick={() => setOpen(true)}>
          Sign out everywhere
        </Button>
      }
    >
      <AlertDialog open={open} onOpenChange={(next) => !busy.current && setOpen(next)}>
        <ConfirmBody busy={busy} title="Sign out everywhere?" submit="Sign out everywhere" pendingLabel="Signing out" run={signOutEverywhereWithError}>
          Uplink signs you out on every device, including this one. Your guest links stop working. You can sign in again with Tesla.
        </ConfirmBody>
      </AlertDialog>
    </Row>
  );
}
