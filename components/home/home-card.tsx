import { WhatsNewCard } from "@/components/home/whats-new-card";
import type { HomeCard as Card } from "@/lib/whats-new";

// Home's one card under the greeting: news (the welcome is a dialog, WelcomeTour). The share card has its own place further down.
export function HomeCard({ card }: { card: Card }) {
  if (card?.kind === "news") return <WhatsNewCard entry={card.entry} more={card.more} />;
  return null;
}
