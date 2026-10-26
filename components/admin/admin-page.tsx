import type { ReactNode } from "react";
import { Header } from "@/components/header";
import { type AdminTab, AdminTabs } from "./admin-tabs";

// Every admin page: the header, one Admin title, the tabs and the page's one line under them. Each page
// checks the admin itself before rendering this, so anyone else gets a 404 and never sees the tabs.
export function AdminPage({ tab, description, children }: { tab: AdminTab; description: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6 pb-12 sm:pt-8 sm:pb-20">
      <Header />
      <h1 className="text-[1.5rem] font-medium tracking-heading max-sm:text-[1.25rem]">Admin</h1>
      <div className="mt-6 mb-12 space-y-4">
        <AdminTabs tab={tab} />
        <div className="text-sm text-muted-foreground">{description}</div>
      </div>
      <div className="space-y-12">{children}</div>
    </div>
  );
}
