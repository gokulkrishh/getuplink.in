import { describe, expect, test } from "bun:test";
import { isAdminAccount, parseAdminAccounts } from "@/lib/admin";

describe("parseAdminAccounts", () => {
  test("splits on commas and trims", () => {
    expect([...parseAdminAccounts(" abc-123 , def-456,")]).toEqual(["abc-123", "def-456"]);
  });
  test("unset or blank is nobody", () => {
    expect(parseAdminAccounts(undefined).size).toBe(0);
    expect(parseAdminAccounts(" , ").size).toBe(0);
  });
});

describe("isAdminAccount", () => {
  const allowed = parseAdminAccounts("abc-123");
  test("only a listed account", () => {
    expect(isAdminAccount("abc-123", allowed)).toBe(true);
    expect(isAdminAccount("abc-1234", allowed)).toBe(false);
  });
  test("no owner yet is nobody", () => {
    expect(isAdminAccount(null, allowed)).toBe(false);
    expect(isAdminAccount("", parseAdminAccounts(""))).toBe(false);
  });
});
