import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PlainPage } from "@/components/plain-page";
import { SANDBOX_ACCOUNTS } from "@/lib/sandbox/accounts";
import { sandboxOn } from "@/lib/sandbox/flag";

// The local sandbox's stand-in for Tesla's sign-in page: /api/auth/connect and an invite's Sign in with
// Tesla land here instead of auth.tesla.com. Choosing an account goes back to the real callback with a fake
// code, as Tesla would; the fake Tesla (lib/sandbox/tesla.ts) then answers for that account. A 404 outside
// the sandbox.

export const metadata: Metadata = { title: "Sandbox Tesla sign-in", robots: { index: false } };

const CALLBACK = "/api/auth/callback";

async function Accounts({ searchParams }: PageProps<"/sandbox/tesla-login">) {
  const params = await searchParams;
  const state = typeof params.state === "string" ? params.state : "";
  const back = (query: Record<string, string>) => `${CALLBACK}?${new URLSearchParams({ ...query, state })}`;
  return (
    <div className="space-y-6">
      <ul className="divide-y border-y">
        {SANDBOX_ACCOUNTS.map((account) => (
          <li key={account.key}>
            {/* A plain link, never prefetched: following it signs in. */}
            <a href={back({ code: account.key })} className="block space-y-0.5 py-3 hover:bg-muted" data-account={account.key}>
              <span className="block text-sm font-medium">{account.label}</span>
              <span className="block text-sm text-muted-foreground">{account.note}</span>
            </a>
          </li>
        ))}
      </ul>
      <a href={back({ error: "access_denied" })} className="text-sm text-muted-foreground underline decoration-dotted underline-offset-4">
        Cancel, as if you closed Tesla&apos;s page
      </a>
    </div>
  );
}

export default function Page(props: PageProps<"/sandbox/tesla-login">) {
  // Before anything streams, so outside the sandbox it is a real 404.
  if (!sandboxOn()) notFound();
  return (
    <PlainPage title="Sign in to a made-up Tesla account" intro="Local sandbox: this stands in for Tesla's sign-in page. Pick who you are.">
      <Suspense>
        <Accounts {...props} />
      </Suspense>
    </PlainPage>
  );
}
