import Link from "next/link";

// Where things are in Uplink: Home's welcome card and the What's new page both show it.
const PLACES: { name: string; where: string; text: string; href: string }[] = [
  { name: "Stats", where: "top bar", text: "Drives, charging spend and battery health.", href: "/stats/driving" },
  { name: "Car", where: "top bar", text: "Your car's details and version.", href: "/car" },
  { name: "Updates", where: "under Car", text: "Every update your car got, with its notes.", href: "/updates" },
  { name: "Compare", where: "under Car", text: "How your car compares with other owners.", href: "/owners" },
  { name: "Settings", where: "your photo", text: "Theme, sharing and your Tesla account.", href: "/settings" },
];

// `onPick` runs when a row is tapped, before the page changes.
export function WhatsNewPlaces({ onPick }: { onPick?: () => void }) {
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {PLACES.map((p) => (
        <li key={p.href}>
          <Link href={p.href} onClick={onPick} className="block h-full border px-3 py-2.5 transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
            <span className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium">{p.name}</span>
              <span className="font-mono text-xs text-faint">{p.where}</span>
            </span>
            <span className="block text-sm text-muted-foreground">{p.text}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
