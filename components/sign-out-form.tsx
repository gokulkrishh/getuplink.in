"use client";

import { useActionState, useEffect, useState } from "react";
import { logout } from "@/app/actions";
import { guardForm } from "@/lib/offline";

// The header's sign-out form, submitted by the account menu's Sign out item (by id). Offline, the page stays
// and a notice says so, instead of the whole page turning into the error page. The notice is fixed to the top
// of the screen, so it shows however far the page is scrolled and nothing moves, and it goes once the
// connection is back.
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
        <p role="alert" className="fixed inset-x-4 top-4 z-50 mx-auto max-w-sm rounded-md border bg-background px-4 py-3 text-sm whitespace-normal text-destructive shadow-md">
          {error}
        </p>
      )}
    </>
  );
}
