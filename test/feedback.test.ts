import { describe, expect, test } from "bun:test";
import { deviceName, feedbackInput } from "@/lib/feedback";

describe("feedback", () => {
  const sent = { topic: "broken", bother: "lot", message: "  The spend chart shows 0 for today.  ", pagePath: "/stats/charging?period=week", pageTitle: "Charging", viewport: "390x844", userAgent: "x", theme: "dark" };

  test("takes the owner's answers and where they were, trimmed", () => {
    const parsed = feedbackInput.parse(sent);
    expect(parsed.message).toBe("The spend chart shows 0 for today.");
    expect(parsed.pagePath).toBe("/stats/charging?period=week");
  });

  test("refuses an empty message, an unknown feeling, or a page that isn't ours", () => {
    expect(feedbackInput.safeParse({ ...sent, message: "   " }).success).toBe(false);
    expect(feedbackInput.safeParse({ ...sent, bother: "angry" }).success).toBe(false);
    expect(feedbackInput.safeParse({ ...sent, pagePath: "https://example.com" }).success).toBe(false);
    expect(feedbackInput.safeParse({ ...sent, viewport: "big" }).success).toBe(false);
  });

  test("a problem says how much it bothers; an idea or praise never does", () => {
    expect(feedbackInput.safeParse({ ...sent, bother: null }).success).toBe(false);
    expect(feedbackInput.safeParse({ ...sent, topic: "idea", bother: null }).success).toBe(true);
    expect(feedbackInput.safeParse({ ...sent, topic: "praise", bother: "lot" }).success).toBe(false);
  });

  test("names the browser and device from the user agent", () => {
    expect(deviceName("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")).toBe("Safari on iPhone");
    expect(deviceName("Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36")).toBe("Chrome on Android");
    expect(deviceName(null)).toBeNull();
  });
});
