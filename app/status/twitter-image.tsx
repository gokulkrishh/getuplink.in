import { CARDS, OG_SIZE, OG_TYPE, ogImage } from "@/lib/og";

export const alt = CARDS.status.alt;
export const size = OG_SIZE;
export const contentType = OG_TYPE;

export default function Image() {
  return ogImage(CARDS.status.card);
}
