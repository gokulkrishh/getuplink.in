import { describe, expect, test } from "bun:test";
import { describeRunError, runErrorReason, withoutStaleTokenError } from "@/lib/run-error";

const refused = "Token request failed (401): login_required, The refresh_token is invalid";
type Run = { started_at: string; finished_at: string | null; ok: boolean | null; error: string | null };
const run: Run = { started_at: "2026-10-25T00:00:00Z", finished_at: "2026-10-25T00:00:05Z", ok: false, error: refused };

describe("withoutStaleTokenError", () => {
  test("a token error from before the last sign-in is dropped, the run kept", () => {
    expect(withoutStaleTokenError(run, "2026-10-25T03:30:00Z")).toEqual({ ...run, error: null });
  });
  test("tokens saved during the run (a refresh) keep its token error", () => {
    expect(withoutStaleTokenError(run, "2026-10-25T00:00:02Z")).toBe(run);
  });
  test("other errors stay, however old", () => {
    const failed = { ...run, error: "Fleet API 503" };
    expect(withoutStaleTokenError(failed, "2026-10-25T03:30:00Z")).toBe(failed);
  });
  test("no saved tokens or an unfinished run change nothing", () => {
    expect(withoutStaleTokenError(run, null)).toBe(run);
    const running: Run = { ...run, finished_at: null, ok: null, error: null };
    expect(withoutStaleTokenError(running, "2026-10-25T03:30:00Z")).toBe(running);
  });
});

describe("runErrorReason", () => {
  test("names the cause in a few words, never the error text", () => {
    expect(runErrorReason('Token request failed (401): {"error":"login_required","error_description":"The refresh_token is invalid"}')).toBe("Tesla access expired");
    expect(runErrorReason("fetch failed")).toBe("Tesla didn't respond");
    expect(runErrorReason("Fleet API 503")).toBe("Didn't finish");
    expect(runErrorReason("Fleet API (503): busy")).toBe("Tesla didn't respond");
    expect(runErrorReason("vehicle 5YJ3E1EA7KF000000 (429)")).toBe("Tesla asked to slow down");
    expect(runErrorReason(null)).toBe("Didn't finish");
  });
  test("a request Uplink gave up waiting on is Tesla not responding", () => {
    expect(runErrorReason("The operation was aborted due to timeout")).toBe("Tesla didn't respond");
    expect(runErrorReason("This operation was aborted")).toBe("Tesla didn't respond");
    expect(describeRunError("The operation was aborted due to timeout")).toBe("Tesla didn't respond. Uplink will try again at the next check.");
  });
  test("Uplink's own database giving up on saving new tokens isn't Tesla not responding", () => {
    const error = "Saving tokens failed: AbortError: The operation was aborted due to timeout";
    expect(runErrorReason(error)).toBe("Didn't finish");
    expect(describeRunError(error)).toBe("The last check didn't finish. Uplink will try again at the next check.");
  });
  test("so is it giving up on claiming the token refresh", () => {
    expect(runErrorReason("Claiming the token refresh failed: AbortError: The operation was aborted due to timeout")).toBe("Didn't finish");
  });
});
