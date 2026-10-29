"use client";

import { SmilePlus } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { openFeedback } from "@/components/feedback-open";

// "Send feedback" in the account menu. Phones only: on larger screens the button floats in the corner.
// The form opens a beat after the menu closes, so the menu's focus return doesn't take focus from it.
export function FeedbackMenuItem() {
  return (
    <DropdownMenuItem className="sm:hidden" onClick={() => setTimeout(openFeedback, 150)}>
      <SmilePlus aria-hidden />
      Send feedback
    </DropdownMenuItem>
  );
}
