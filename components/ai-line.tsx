import { Sparkles } from "lucide-react";
import { InfoButton } from "@/components/info-button";
import type { ShownLine } from "@/lib/drive-wording";

export const AI_WORDS = "Written by AI from this drive's figures.";

// A line of text that may be the AI's (lib/drive-wording.ts). The AI's starts with a small sparkles mark
// whose tip says so, opening like the ⓘ beside it; a code sentence shows as plain text. Spans only, so it
// sits inside a <p> (ChartCard's description).
export function AiLine({ line }: { line: ShownLine }) {
  if (!line.ai) return <>{line.text}</>;
  // The mark in its own column, the text wrapping beside it, so every line of it starts at the same edge.
  return (
    <span className="flex items-start gap-2">
      <InfoButton
        label="AI wording"
        ariaLabel="Written by AI"
        icon={<Sparkles className="size-3.5" aria-hidden="true" />}
        className="mt-px size-5 shrink-0 text-muted-foreground"
      >
        {AI_WORDS}
      </InfoButton>
      <span className="ai-shimmer min-w-0">{line.text}</span>
    </span>
  );
}
