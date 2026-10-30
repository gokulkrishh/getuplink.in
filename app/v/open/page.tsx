import type { Metadata } from "next";
import { PlainPage } from "@/components/plain-page";
import { Claim } from "./claim";
import { OPEN_INTRO, OPEN_TITLE } from "./words";

// Where /v/<token> sends a browser on its way to becoming a guest (app/v/[token]/route.ts). Its script claims
// the link (/v/seen), then goes Home, or to the ended page when another browser got there first. A link
// preview runs no script, so it stops here and never uses the link up.
export const metadata: Metadata = { title: "Guest view", robots: { index: false }, referrer: "no-referrer" };

// Nothing shows while the claim runs, which is usually a moment: the guest goes straight to the car. The
// words show only if the claim fails (Claim draws them), or in a browser with scripts off, which can't claim.
export default function Page() {
  return (
    <>
      <Claim />
      <noscript>
        <PlainPage home="/home" title={OPEN_TITLE} intro={OPEN_INTRO} />
      </noscript>
    </>
  );
}
