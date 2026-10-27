import { Sparkles } from "lucide-react";
import type { ShownLine } from "@/lib/drive-wording";

// A line of text that may be the AI's (lib/drive-wording.ts). The AI's starts with a small sparkles mark;
// a code sentence shows as plain text. Spans only, so it sits inside a <p> (ChartCard's description).
export function AiLine({ line }: { line: ShownLine }) {
  if (!line.ai) return <>{line.text}</>;
  // The mark in its own column, the text wrapping beside it, so every line of it starts at the same edge.
  return (
    <span className="flex items-start gap-2">
      <span className="mt-px flex size-5 shrink-0 items-center justify-center text-muted-foreground">
        <Sparkles className="size-3.5" aria-hidden="true" />
        <span className="sr-only">Written by AI</span>
      </span>
      <span className="ai-shimmer min-w-0">{line.text}</span>
    </span>
  );
}
