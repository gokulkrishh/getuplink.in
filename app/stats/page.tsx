import { redirect } from "next/navigation";
import { Suspense } from "react";
import { statsRedirect } from "@/lib/stats-redirect";

// /stats has a page per topic now. proxy.ts redirects /stats before it renders (a real 307); this page
// does the same if a request ever gets here.
async function StatsRedirect({ searchParams }: Pick<PageProps<"/stats">, "searchParams">): Promise<null> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) if (typeof value === "string") params.set(key, value);
  redirect(statsRedirect(params));
  return null;
}

export default function Page({ searchParams }: PageProps<"/stats">) {
  return (
    <Suspense>
      <StatsRedirect searchParams={searchParams} />
    </Suspense>
  );
}
