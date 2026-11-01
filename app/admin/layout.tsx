import { cacheLife, cacheTag } from "next/cache";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { Header, PhoneNav } from "@/components/header";
import { isAdmin } from "@/lib/server/admin";
import { hasCurrentSession, ownerOnlyExit } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { FEEDBACK_TAG, unreadFeedback } from "@/lib/server/feedback";

// As the pages: the admin check runs before anything streams, so anyone else gets a real 404.
export const instant = false;

// Kept 5 minutes, like the pages, so a link's prefetch carries it. Each page and every save checks again.
async function checkAdmin(): Promise<void> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 300 });
  if (!(await hasCurrentSession())) await ownerOnlyExit();
  if (!(await isAdmin())) notFound();
}

// Unread feedback, for the dot on its tab. Its own cache, refreshed when feedback arrives or is marked.
async function unreadCount(): Promise<number> {
  "use cache: private";
  cacheTag(FEEDBACK_TAG);
  cacheLife({ stale: 300 });
  return unreadFeedback();
}

// The header, the Admin title and the tabs, shared by every admin page so they stay on screen between
// pages and the tab highlight slides; each page draws its one line and its content under them.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await checkAdmin();
  const unread = await unreadCount();
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6 pb-12 sm:pt-8 sm:pb-20">
      <Header setup={false} />
      <h1 className="text-[1.5rem] font-medium tracking-heading max-sm:text-[1.25rem]">Admin</h1>
      <div className="mt-6 mb-4">
        <AdminTabs unread={unread} />
      </div>
      {children}
      <PhoneNav />
    </div>
  );
}
