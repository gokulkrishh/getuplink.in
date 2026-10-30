import { describe, expect, test } from "bun:test";
import { GUEST_TOUR_COOKIE, guestTourSeen, guestTourSeenCookie } from "@/lib/guest-tour";

describe("guest tour cookie", () => {
  test("seen only with uplink-guest-tour=seen among the cookies", () => {
    expect(guestTourSeen("")).toBe(false);
    expect(guestTourSeen("a=1; b=2")).toBe(false);
    expect(guestTourSeen(`${GUEST_TOUR_COOKIE}=other`)).toBe(false);
    expect(guestTourSeen(`x=y; ${GUEST_TOUR_COOKIE}=seen`)).toBe(true);
    expect(guestTourSeen(`${GUEST_TOUR_COOKIE}=seen; x=y`)).toBe(true);
    expect(guestTourSeen(`not-${GUEST_TOUR_COOKIE}=seen`)).toBe(false);
  });
  test("the cookie it sets is read back as seen, for a year, site-wide", () => {
    const c = guestTourSeenCookie();
    expect(guestTourSeen(c.split(";")[0])).toBe(true);
    expect(c).toContain("Path=/");
    expect(c).toContain("SameSite=Lax");
    expect(c).toContain("Max-Age=31536000");
  });
});
