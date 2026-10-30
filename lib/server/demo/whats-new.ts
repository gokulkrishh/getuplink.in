import type { Entry } from "@/lib/whats-new";

// Sample entries for demo copies only, so the card, the "more" link, the bell line and the page can be seen.
// Never in WHATS_NEW. Dated after DEMO_OLD_OWNER so the demo owner counts as someone who joined before them.
export const DEMO_ENTRIES: Entry[] = [
  { id: "2026-11-24-sample-charts", date: "2026-11-24", title: "A new look at charging", text: "Charging now shows what each place cost you over the month.", link: { label: "Try it", href: "/stats/charging" }, audience: "owners", show: "card" },
  { id: "2026-11-20-sample-guest", date: "2026-11-20", title: "Guest access", text: "Send someone a link to see your car for as long as you choose.", more: "They don't need a Tesla account.", link: { label: "Try it", href: "/settings" }, audience: "owners", show: "card" },
  { id: "2026-11-12-sample-compare", date: "2026-11-12", title: "Compare with owners", text: "See how your car does next to other owners.", link: { label: "Try it", href: "/owners" }, audience: "owners", show: "card" },
  { id: "2026-11-08-sample-detail", date: "2026-11-08", title: "More on the Car page", text: "The Car page now shows the wheels and trim.", link: { label: "Open Car", href: "/car" }, audience: "owners", show: "bell" },
];

export const DEMO_OLD_OWNER = Date.parse("2026-10-01T00:00:00+05:30");
