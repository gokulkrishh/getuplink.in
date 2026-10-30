import type { Metadata } from "next";
import { PlainPage } from "@/components/plain-page";
import { Claim } from "./claim";

// Where /v/<token> sends a browser on its way to becoming a guest (app/v/[token]/route.ts). Its script claims
// the link (/v/seen), then goes Home, or to the ended page when another browser got there first. A link
// preview runs no script, so it stops here and never uses the link up.
export const metadata: Metadata = { title: "Guest view", robots: { index: false }, referrer: "no-referrer" };

export default function Page() {
  return (
    <PlainPage home="/home" title="Opening guest view" intro="This link works in one browser only.">
      <Claim />
    </PlainPage>
  );
}
