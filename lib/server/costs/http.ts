import "server-only";

// The JSON GETs behind Supabase, Fly.io and the domain. A failure throws a ProviderError whose message is
// the provider and a status only ("Fly.io 403", "RDAP timeout"): never the URL, a header or the body, so
// it is safe to log. Tokens are passed in the headers here and nowhere else.

const TIMEOUT_MS = 8000;

// The cache tag on the Supabase, Fly.io and domain reads.
export const PROVIDER_COSTS_TAG = "admin-costs-providers";

// "shape": the body parsed but isn't what the docs describe.
export type FailureStatus = number | "timeout" | "network" | "body" | "shape";

export class ProviderError extends Error {
  constructor(what: string, readonly status: FailureStatus) {
    super(`${what} ${status}`);
    this.name = "ProviderError";
  }
}

export async function getJson(what: string, url: string, headers: Record<string, string> = {}): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: "application/json", ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    throw new ProviderError(what, name === "TimeoutError" || name === "AbortError" ? "timeout" : "network");
  }
  if (!res.ok) throw new ProviderError(what, res.status);
  try {
    return await res.json();
  } catch {
    throw new ProviderError(what, "body");
  }
}

// What goes in the log for a failed read: the provider's own short message, or just the provider. A
// thrown error from anywhere else could carry a URL, so its text is never logged.
export function describeError(what: string, err: unknown): string {
  const message = err instanceof Error ? err.message : "";
  return /^[\w. ]+ (\d{3}|timeout|network|body|shape)$/.test(message) ? `${message}` : `${what} error`;
}
