import { unstable_rethrow } from "next/navigation";

// A dropped connection rejects a server action called from the browser. Uncaught, that swaps the page for
// the error page and loses whatever was typed, so callers show this line in place instead.
export const OFFLINE = "Couldn't reach Uplink. Check your connection and try again.";

// The action's answer, or `failed` when it couldn't be reached. A redirect the action asked for (to sign in,
// say) still goes through.
export function orOffline<T>(action: Promise<T>, failed: T): Promise<T> {
  return action.catch((err: unknown) => {
    unstable_rethrow(err);
    return failed;
  });
}

// A form's action for useActionState: null once it has run, OFFLINE when it couldn't be reached. For forms
// whose action ends in a redirect (sign out, Sign in with Tesla), so offline the page stays and says why.
// Only a dropped connection (fetch's TypeError) gets the line; a failure on the server still shows the error
// page, rather than telling the owner to check a connection that works.
export function guardForm(action: (form: FormData) => Promise<unknown>) {
  return (_: string | null, form: FormData): Promise<string | null> =>
    action(form).then(
      () => null,
      (err: unknown) => {
        unstable_rethrow(err);
        if (err instanceof TypeError) return OFFLINE;
        throw err;
      },
    );
}
