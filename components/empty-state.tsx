import type { ReactNode } from "react";

// A dashed placeholder card for a section with nothing to show yet: icon, title, one line, optional action.
export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-foreground/20 px-6 py-8 text-center">
      {icon}
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="max-w-md text-sm text-balance text-muted-foreground">{children}</p>
      {action && <div className="pt-2">{action}</div>}
    </section>
  );
}
