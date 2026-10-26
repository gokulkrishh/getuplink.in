import type { ReactNode } from "react";

// An admin page under the shared header and tabs (app/admin/layout.tsx): its one line, then its content.
// Each page checks the admin itself as well, so anyone else gets a 404.
export function AdminPage({ description, children }: { description: ReactNode; children: ReactNode }) {
  return (
    <>
      <div className="mb-12 text-sm text-muted-foreground">{description}</div>
      <div className="space-y-12">{children}</div>
    </>
  );
}
