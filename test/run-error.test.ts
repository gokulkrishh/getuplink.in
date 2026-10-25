import { describe, expect, test } from "bun:test";
import { withoutStaleTokenError } from "@/lib/run-error";

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
