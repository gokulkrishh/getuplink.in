"use client";

import { usePathname } from "next/navigation";
import { TabLinks } from "@/components/segmented";

export type AdminTab = "overview" | "access" | "costs";

const TABS: { value: AdminTab; label: string; href: string }[] = [
  { value: "overview", label: "Overview", href: "/admin" },
  { value: "access", label: "Access", href: "/admin/waitlist" },
  { value: "costs", label: "Costs", href: "/admin/costs" },
];

// The admin pages' links, styled like the Stats sections. They live in the admin layout, so the tab is the
// page the path names.
export function AdminTabs() {
  const path = usePathname();
  const tab = [...TABS].reverse().find((t) => path.startsWith(t.href))?.value ?? "overview";
  return <TabLinks name="admin-tab-indicator" label="Admin sections" options={TABS} value={tab} />;
}
