"use client";

import { usePathname } from "next/navigation";
import { TabLinks } from "@/components/segmented";

export type AdminTab = "overview" | "access" | "costs" | "feedback";

const TABS: { value: AdminTab; label: string; href: string }[] = [
  { value: "overview", label: "Overview", href: "/admin" },
  { value: "access", label: "Access", href: "/admin/waitlist" },
  { value: "costs", label: "Costs", href: "/admin/costs" },
  { value: "feedback", label: "Feedback", href: "/admin/feedback" },
];

// The admin pages' links, styled like the Car sections. They live in the admin layout, so the tab is the
// page the path names.
// `unread`: feedback not read yet, shown as a dot on the Feedback tab.
export function AdminTabs({ unread = 0 }: { unread?: number }) {
  const path = usePathname();
  const tab = [...TABS].reverse().find((t) => path.startsWith(t.href))?.value ?? "overview";
  const options = TABS.map((t) => (t.value === "feedback" ? { ...t, dot: unread > 0 } : t));
  return <TabLinks name="admin-tab-indicator" label="Admin sections" options={options} value={tab} />;
}
