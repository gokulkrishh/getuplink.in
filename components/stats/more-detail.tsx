import type { ReactNode } from "react";
import { FoldToggle } from "@/components/fold-toggle";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export const MORE_DETAIL = { title: "More detail", description: "Cell balance and temperatures." };

// The Battery page's closer look, closed at first: a heading and its line with Show beside it, after the
// Settings page's Connect your AI. The charts inside are h3s. Closed, they stay in the page (see
// CollapsibleContent), so opening draws them at once, and each one's download works as usual.
export function MoreDetail({ children }: { children: ReactNode }) {
  return (
    <Collapsible className="group">
      {/* A div (with the button role), since it holds a heading, which a <button> can't. */}
      <CollapsibleTrigger nativeButton={false} render={<div />} className="flex w-full cursor-pointer items-center justify-between gap-4 text-left focus-visible:outline-2 focus-visible:outline-ring">
        <div className="min-w-0 space-y-1">
          <h2 className="text-lg font-medium tracking-heading">{MORE_DETAIL.title}</h2>
          <p className="text-sm text-muted-foreground">{MORE_DETAIL.description}</p>
        </div>
        <FoldToggle />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-12 pt-8">{children}</CollapsibleContent>
    </Collapsible>
  );
}
