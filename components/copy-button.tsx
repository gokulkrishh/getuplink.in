"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

// Copies text and says so for two seconds. Where the clipboard is refused, the text next to it stays
// selectable, so it can still be copied by hand.
export function CopyButton({ text, label = "Copy", className }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      onClick={() =>
        navigator.clipboard.writeText(text).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          },
          () => setCopied(false),
        )
      }
    >
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </Button>
  );
}
