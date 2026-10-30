"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActionState, useEffect, useState } from "react";
import { logout } from "@/app/actions";
import { guardForm } from "@/lib/offline";

// The header's sign-out form, submitted by the account menu's Sign out item (by id). Offline, the page stays
// and a notice says so, instead of the whole page turning into the error page. The notice is fixed to the top
// of the screen, so it shows however far the page is scrolled and nothing moves. It goes once the connection
// is back, or when it's closed.
export function SignOutForm() {
  const [error, run] = useActionState(guardForm(logout), null);
  const [cleared, setCleared] = useState(false);
  useEffect(() => {
    const clear = () => setCleared(true);
    window.addEventListener("online", clear);
    return () => window.removeEventListener("online", clear);
  }, []);
  const action = (form: FormData) => {
    setCleared(false);
    run(form);
  };
  return (
    <>
      <form id="sign-out" action={action} hidden />
      {error && !cleared && (
        <div
          role="alert"
          className="fixed inset-x-4 top-4 z-50 mx-auto flex max-w-sm items-start gap-3 rounded-md border bg-background py-3 pr-2 pl-4 text-sm whitespace-normal text-destructive shadow-md"
        >
          <p className="flex-1">{error}</p>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => setCleared(true)} aria-label="Close" className="-my-1 shrink-0 text-muted-foreground">
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      )}
    </>
  );
}
