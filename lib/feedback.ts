// Feedback from owners: what it's about, for a problem how much it bothers them, their words, and the page
// they were on. Shared by the form (components/feedback-button.tsx), the action that saves it and
// Admin > Feedback. The check on what's sent lives in lib/server/feedback.ts, so zod stays off the page.

export const TOPICS = [
  { value: "broken", label: "Something's wrong" },
  { value: "confusing", label: "Hard to understand" },
  { value: "idea", label: "An idea" },
  { value: "praise", label: "Something I like" },
] as const;

// Asked only about a problem, so an idea or praise can't come with a frustration it doesn't have.
export const BOTHER = [
  { value: "little", label: "A little" },
  { value: "lot", label: "A lot" },
] as const;

export type Topic = (typeof TOPICS)[number]["value"];
export type Bother = (typeof BOTHER)[number]["value"];

export const isProblem = (topic: Topic | null): boolean => topic === "broken" || topic === "confusing";

export const MESSAGE_MAX = 2000;

export const topicLabel = (v: string) => TOPICS.find((t) => t.value === v)?.label ?? v;
export const botherLabel = (v: string | null) => (v === "lot" ? "Bothers a lot" : v === "little" ? "Bothers a little" : null);

// "Chrome on Android", "Safari on iPhone", from a user agent: enough to tell the screens apart in Admin.
export function deviceName(ua: string | null): string | null {
  if (!ua) return null;
  const browser = /Edg\//.test(ua) ? "Edge" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /FxiOS|Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : null;
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : null;
  return [browser, os].filter(Boolean).join(" on ") || null;
}
