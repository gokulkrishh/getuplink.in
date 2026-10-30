// The Compare page for a guest (someone the owner sent a guest link): what the owner's sharing line and
// Share button say, without the owner's way to share or stop (Settings). Server-rendered in their place.

// A guest's line in the sharing line's place: the same box, without the owner's way to stop.
export function GuestSharingLine({ text }: { text: string }) {
  return <p className="min-w-0 flex-1 text-sm">{text}</p>;
}

// What a guest sees when the owner doesn't share: no comparisons, and nothing to do about it.
export function GuestNotSharing() {
  return (
    <section className="space-y-2 border p-5 sm:p-8">
      <h2 className="text-lg font-medium tracking-heading">No comparisons to show</h2>
      <p className="text-sm text-muted-foreground">The owner doesn&apos;t share this car&apos;s figures with other owners.</p>
    </section>
  );
}
