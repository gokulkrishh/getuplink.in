import type { Metadata } from "next";
import { PlainPage } from "@/components/plain-page";
import { LINK_ENDED_BODY, LINK_ENDED_TITLE } from "@/lib/view-links";
import { FullLoad } from "./full-load";

// Where an ended, expired, unknown or used view link lands. proxy.ts answers 410 and drops the guest
// cookies on the way here.
export const metadata: Metadata = { title: "Link expired", robots: { index: false }, referrer: "no-referrer" };

export default function Page() {
  return (
    <>
      <FullLoad />
      <PlainPage home="/home" title={LINK_ENDED_TITLE} intro={LINK_ENDED_BODY} />
    </>
  );
}
