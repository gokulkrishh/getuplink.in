import { DEMO_SITE } from "@/lib/demo";
import { CARDS, OG_SIZE, OG_TYPE, ogImage } from "@/lib/og";

// Every page without its own card (the app's pages, privacy and terms) shares this one.
const CARD = DEMO_SITE ? CARDS.demo : CARDS.app;

export const alt = CARD.alt;
export const size = OG_SIZE;
export const contentType = OG_TYPE;

export default function Image() {
  return ogImage(CARD.card);
}
