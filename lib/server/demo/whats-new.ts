import type { Entry } from "@/lib/whats-new";

// Sample entries for demo copies only, so the card, the count link, the bell line and the page can be seen.
// Never in WHATS_NEW. Dated after DEMO_OLD_OWNER so the demo owner counts as someone who joined before them.
// The screenshots are crops of the demo's own pages, in public/whats-new/demo/. Demo-only samples.
export const DEMO_ENTRIES: Entry[] = [
  {
    id: "2026-11-24-sample-charts",
    date: "2026-11-24",
    version: "0.4",
    title: "A new look at charging",
    text: "Charging now shows what you spent each day, and the rate you paid.",
    image: { src: "/whats-new/demo/charging.webp", alt: "The Spend section of Stats, with the week's charging spend, a bar for each day and tiles for energy, bills and rate.", width: 1200, height: 929 },
    audience: "owners",
    show: "card",
  },
  {
    id: "2026-11-20-sample-tour",
    date: "2026-11-20",
    version: "0.3",
    title: "Welcome tour in Settings",
    text: "Settings now has a Welcome tour you can show again any time.",
    more: "It changes nothing on your account.",
    image: { src: "/whats-new/demo/tour.webp", alt: "The General part of Settings, with the Welcome tour row and its Show button.", width: 1200, height: 696 },
    audience: "owners",
    show: "card",
  },
  {
    id: "2026-11-12-sample-compare",
    date: "2026-11-12",
    version: "0.3",
    title: "Compare with owners",
    text: "See how your car does next to other owners.",
    image: { src: "/whats-new/demo/compare.webp", alt: "The Compare page, with how many owners share and four comparisons picked for you.", width: 1200, height: 964 },
    audience: "owners",
    show: "card",
  },
  {
    id: "2026-11-08-sample-detail",
    date: "2026-11-08",
    version: "0.2",
    title: "More on the Car page",
    text: "The Car page now shows the wheels and trim.",
    image: { src: "/whats-new/demo/car.webp", alt: "The Specs list on the Car page, with Wheels and Window trim among the rows.", width: 1200, height: 598 },
    audience: "owners",
    show: "bell",
  },
];

export const DEMO_OLD_OWNER = Date.parse("2026-10-01T00:00:00+05:30");
