import { WelcomeCard } from "@/components/home/welcome-card";
import { WhatsNewCard } from "@/components/home/whats-new-card";
import type { HomeCard as Card } from "@/lib/whats-new";

// Home's one card under the greeting: welcome or news. The share card has its own place further down.
export function HomeCard({ card }: { card: Card }) {
  if (card?.kind === "welcome") return <WelcomeCard />;
  if (card?.kind === "news") return <WhatsNewCard entry={card.entry} more={card.more} />;
  return null;
}
