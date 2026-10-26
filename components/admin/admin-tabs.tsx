"use client";

import { TabLinks } from "@/components/segmented";

export type AdminTab = "overview" | "access" | "costs";

const TABS: { value: AdminTab; label: string; href: string }[] = [
  { value: "overview", label: "Overview", href: "/admin" },
  { value: "access", label: "Access", href: "/admin/waitlist" },
  { value: "costs", label: "Costs", href: "/admin/costs" },
];

// The admin pages' links, styled like the Stats sections.
export function AdminTabs({ tab }: { tab: AdminTab }) {
  return <TabLinks name="admin-tab-indicator" label="Admin sections" options={TABS} value={tab} />;
}
