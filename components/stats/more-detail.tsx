import type { ReactNode } from "react";
import { Fold } from "@/components/fold";

export const MORE_DETAIL = { title: "More detail", description: "Cell balance and temperatures." };

// The Battery page's closer look, closed at first: a heading and its line with Show beside it (Fold). The
// charts inside are h3s. Closed, they stay in the page (see
// CollapsibleContent), so opening draws them at once, and each one's download works as usual.
export function MoreDetail({ children }: { children: ReactNode }) {
  return (
    <Fold title={MORE_DETAIL.title} description={MORE_DETAIL.description} contentClassName="space-y-12 pt-8">
      {children}
    </Fold>
  );
}
