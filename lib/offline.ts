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
