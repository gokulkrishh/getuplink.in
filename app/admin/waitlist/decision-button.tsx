"use client";

import { type ReactNode, useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import type { LinkResult } from "./actions";
import { LinkPanel } from "./invite-forms";

// One button on a row. `action` comes bound from the server (see actions.ts), which checks the admin
// again. A decision hands back the message to show or null; a link action the link or why there's none.
export type RowAction = {
  label: string;
  pendingLabel: string;
  action: (previous: null, form: FormData) => Promise<string | null | LinkResult>;
  primary?: boolean;
  disabled?: boolean;
};

type Shown = { message?: string; url?: string } | null;

function shown(result: string | null | LinkResult): Shown {
  if (typeof result === "string") return { message: result };
  return result;
}

// A row of the Access lists: what it is on the left, its buttons together on the right (below it on a
// phone when they don't fit), and what the last one did as one line across the whole row.
// `id` is the row's link target, so other admin pages can point at it.
export function ActionRow({ children, actions, id }: { children: ReactNode; actions: RowAction[]; id?: string }) {
  const [clicked, setClicked] = useState<number | null>(null);
  const [result, dispatch, pending] = useActionState(async (_previous: Shown, form: FormData): Promise<Shown> => {
    const picked = actions[Number(form.get("action"))];
    return picked ? shown(await picked.action(null, form)) : null;
  }, null);
  return (
    <li id={id} className="flex flex-wrap scroll-mt-20 items-start justify-between gap-x-4 gap-y-2 py-3">
      <div className="min-w-0 flex-1 basis-44 space-y-0.5">{children}</div>
      {actions.length > 0 && (
        <form action={dispatch} className="ml-auto flex shrink-0 items-center gap-2">
          {actions.map((a, k) => (
            <Button
              key={a.label}
              type="submit"
              name="action"
              value={k}
              size="sm"
              variant={a.primary ? "default" : "outline"}
              className="min-w-18"
              disabled={a.disabled || pending}
              onClick={() => setClicked(k)}
            >
              {pending && clicked === k ? a.pendingLabel : a.label}
            </Button>
          ))}
        </form>
      )}
      {result?.message && (
        <p role="alert" className="basis-full text-sm text-destructive">
          {result.message}
        </p>
      )}
      {result?.url && (
        <div className="basis-full">
          <LinkPanel url={result.url} />
        </div>
      )}
    </li>
  );
}
