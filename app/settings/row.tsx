export function Row({
  title,
  description,
  control,
  children,
  id,
}: {
  id?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  control?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div id={id} className="scroll-mt-20 py-4">
      {/* Phones stack the control under the text, so neither is squeezed into a narrow column. The
          control stays on the right at every width. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-base">{title}</p>
          {description && <div className="space-y-0.5 text-sm text-muted-foreground">{description}</div>}
        </div>
        {control && <div className="self-end sm:self-auto sm:shrink-0">{control}</div>}
      </div>
      {children}
    </div>
  );
}
