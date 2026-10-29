import { describe, expect, test } from "bun:test";
import { guardForm, OFFLINE } from "@/lib/offline";

// A form's action that can't reach Uplink (the phone is offline) says so in place, instead of the whole
// page turning into "Couldn't load this page" (sign out in the header, Sign in with Tesla on an invite).
describe("guardForm", () => {
  test("a dropped connection gives the offline line", async () => {
    const run = guardForm(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await run(null, new FormData())).toBe(OFFLINE);
  });
  test("a server failure isn't called a dropped connection", async () => {
    const failure = Object.assign(new Error("An error occurred in the Server Components render."), { digest: "1234" });
    const run = guardForm(async () => {
      throw failure;
    });
    await expect(run(null, new FormData())).rejects.toBe(failure);
  });
  test("an action that finishes clears the line", async () => {
    const seen: FormData[] = [];
    const form = new FormData();
    const run = guardForm(async (f: FormData) => {
      seen.push(f);
    });
    expect(await run(OFFLINE, form)).toBeNull();
    expect(seen).toEqual([form]);
  });
  test("a redirect the action asks for still goes through", async () => {
    // Next's own redirect error, built here: another test file mocks next/navigation's redirect.
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/home;307;" });
    const run = guardForm(async () => {
      throw redirect;
    });
    await expect(run(null, new FormData())).rejects.toBe(redirect);
  });
});
