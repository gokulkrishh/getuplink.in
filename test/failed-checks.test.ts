import { describe, expect, test } from "bun:test";
import { accountLabel, failureOutcome, outcomeLine } from "@/lib/failed-checks";

const fail = { at: "2026-10-25T00:00:00Z", reason: "Tesla access expired" };

describe("failureOutcome", () => {
  test("a good check after the failure means it was fixed, and says when", () => {
    expect(failureOutcome(fail, { lastGoodAt: "2026-10-25T06:00:00Z", tokensSavedAt: null })).toEqual({ state: "fixed", at: "2026-10-25T06:00:00Z", how: "check" });
  });
  test("a good check from before the failure fixes nothing", () => {
    expect(failureOutcome(fail, { lastGoodAt: "2026-10-24T18:00:00Z", tokensSavedAt: null })).toEqual({ state: "open" });
  });
  test("no good check at all is still open", () => {
    expect(failureOutcome(fail, { lastGoodAt: null, tokensSavedAt: null })).toEqual({ state: "open" });
  });
  test("a sign-in after an expired-access failure counts, before a good check shows", () => {
    expect(failureOutcome(fail, { lastGoodAt: null, tokensSavedAt: "2026-10-25T03:30:00Z" })).toEqual({ state: "fixed", at: "2026-10-25T03:30:00Z", how: "sign-in" });
  });
  test("saved tokens never fix other failures", () => {
    expect(failureOutcome({ ...fail, reason: "Tesla didn't respond" }, { lastGoodAt: null, tokensSavedAt: "2026-10-25T03:30:00Z" })).toEqual({ state: "open" });
  });
  test("the earlier of a good check and a sign-in is the time shown", () => {
    expect(failureOutcome(fail, { lastGoodAt: "2026-10-25T06:00:00Z", tokensSavedAt: "2026-10-25T03:30:00Z" })).toEqual({ state: "fixed", at: "2026-10-25T03:30:00Z", how: "sign-in" });
  });
});

describe("accountLabel", () => {
  test("name and the end of the VIN", () => {
    expect(accountLabel(7, { name: "Arun's Model Y", vinSuffix: "A48210" })).toEqual({ name: "Arun's Model Y", vin: "A48210" });
  });
  test("a VIN alone still names the account", () => {
    expect(accountLabel(7, { name: null, vinSuffix: "A48210" })).toEqual({ name: "Account 7", vin: "A48210" });
  });
  test("no car is known: the number only", () => {
    expect(accountLabel(7, undefined)).toEqual({ name: "Account 7", vin: null });
  });
});

describe("outcomeLine", () => {
  const time = (at: string) => `at ${at}`;
  test("says what is known and nothing more", () => {
    expect(outcomeLine({ state: "open" }, time)).toBe("No good check since");
    expect(outcomeLine({ state: "fixed", at: "T", how: "check" }, time)).toBe("Worked again, at T");
    expect(outcomeLine({ state: "fixed", at: "T", how: "sign-in" }, time)).toBe("Signed in again, at T");
  });
});
