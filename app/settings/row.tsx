export function Row({
  title,
  description,
  control,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  control?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="py-4">
      {/* Control stays on the right at every width; the text wraps beside it. */}
      <div className="flex items-center justify-between gap-4 sm:gap-8">
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm">{title}</p>
          {description && <div className="space-y-0.5 text-xs text-muted-foreground">{description}</div>}
        </div>
        <div className="shrink-0">{control}</div>
      </div>
      {children}
    </div>
  );
}
