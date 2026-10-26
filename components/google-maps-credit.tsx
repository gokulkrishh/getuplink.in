import { cn } from "@/lib/utils";

// Google's text attribution, beside any name that came from Google Maps. Its rules: the words "Google
// Maps" exactly, on one line, never translated, 12 to 16 px, weight 400, in #5E5E5E, #1F1F1F or white at
// 4.5:1 contrast (gray on our light background, white on the dark one). docs/place-names.md.
export function GoogleMapsCredit({ className }: { className?: string }) {
  return (
    <span translate="no" className={cn("text-xs font-normal whitespace-nowrap text-[#5e5e5e] dark:text-white", className)}>
      Google Maps
    </span>
  );
}
