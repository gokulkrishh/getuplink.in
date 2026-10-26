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

// The error to throw, logged here first: under Next, an error thrown inside a cache scope is serialized and
// its message can be replaced in production, so the caller can't log the status itself.
export function providerError(what: string, status: FailureStatus): ProviderError {
  const err = new ProviderError(what, status);
  console.warn(`Costs read failed: ${err.message}`);
  return err;
}

// `quiet` throws without logging, for a caller that tries more than one URL and logs once itself.
export async function getJson(
  what: string,
  url: string,
  headers: Record<string, string> = {},
  { quiet = false, fetcher = fetch }: { quiet?: boolean; fetcher?: typeof fetch } = {},
): Promise<unknown> {
  const fail = (status: FailureStatus) => (quiet ? new ProviderError(what, status) : providerError(what, status));
  let res: Response;
  try {
    res = await fetcher(url, { headers: { Accept: "application/json", ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    throw fail(name === "TimeoutError" || name === "AbortError" ? "timeout" : "network");
  }
  if (!res.ok) throw fail(res.status);
  try {
    return await res.json();
  } catch {
    throw fail("body");
  }
}
