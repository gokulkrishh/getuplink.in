"use client";

import { useActionState, useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EntryValues } from "@/lib/costs";
import { NO_AUTOFILL } from "@/lib/no-autofill";

type Action = (previous: string | null, form: FormData) => Promise<string | null>;

const label = "flex flex-col gap-1 text-xs text-muted-foreground";
const select =
  "h-8 max-sm:h-10 w-full rounded-lg border border-input bg-transparent px-2 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

function Message({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs text-destructive">
      {message}
    </p>
  );
}

// One added cost's fields, in dollars.
export function EntryForm({
  action,
  remove,
  values,
  submitLabel = "Save",
  readOnly = false,
}: {
  action: Action;
  remove?: Action;
  values: EntryValues | null;
  submitLabel?: string;
  // Demo mode: nothing saves, so the buttons are off (the page says so once).
  readOnly?: boolean;
}) {
  const [message, formAction, pending] = useActionState(action, null);
  const [removeMessage, removeAction, removing] = useActionState(remove ?? (async () => null), null);
  const id = useId();
  return (
    <div className="space-y-2 pt-2">
      <form action={formAction} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className={`${label} col-span-2`} htmlFor={`${id}-name`}>
          Name
          <Input id={`${id}-name`} name="name" defaultValue={values?.name ?? ""} required maxLength={80} {...NO_AUTOFILL} />
        </label>
        <label className={label} htmlFor={`${id}-amount`}>
          Amount, $
          <Input id={`${id}-amount`} name="amount" inputMode="decimal" defaultValue={values?.amount ?? ""} required {...NO_AUTOFILL} />
        </label>
        <label className={label} htmlFor={`${id}-period`}>
          Billed
          <select id={`${id}-period`} name="period" defaultValue={values?.period ?? "monthly"} className={select}>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </label>
        <label className={`${label} col-span-2 sm:col-span-1`} htmlFor={`${id}-renews`}>
          Renews on
          <Input id={`${id}-renews`} name="renewsOn" type="date" defaultValue={values?.renewsOn ?? ""} />
        </label>
        <label className={`${label} col-span-2 sm:col-span-3`} htmlFor={`${id}-link`}>
          Billing link
          <Input id={`${id}-link`} name="link" type="url" placeholder="https://" defaultValue={values?.link ?? ""} {...NO_AUTOFILL} />
        </label>
        <div className="col-span-2 flex items-center gap-2 sm:col-span-4">
          <Button type="submit" size="sm" disabled={readOnly || pending}>
            {pending ? "Saving…" : submitLabel}
          </Button>
          {remove && (
            <Button type="submit" size="sm" variant="outline" formAction={removeAction} formNoValidate disabled={readOnly || removing}>
              {removing ? "Removing…" : "Remove"}
            </Button>
          )}
        </div>
      </form>
      <Message message={message ?? removeMessage} />
    </div>
  );
}

// A single number: the budget.
export function NumberForm({
  action,
  name,
  label: text,
  defaultValue,
  placeholder,
  readOnly = false,
}: {
  action: Action;
  name: string;
  label: string;
  defaultValue: string;
  placeholder?: string;
  readOnly?: boolean;
}) {
  const [message, formAction, pending] = useActionState(action, null);
  const id = useId();
  return (
    <form action={formAction} className="space-y-1">
      <label htmlFor={id} className={label}>
        {text}
      </label>
      <div className="flex items-center gap-2">
        <Input id={id} name={name} inputMode="decimal" defaultValue={defaultValue} placeholder={placeholder} className="max-w-[12ch]" {...NO_AUTOFILL} />
        <Button type="submit" size="sm" variant="outline" disabled={readOnly || pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      <Message message={message} />
    </form>
  );
}
