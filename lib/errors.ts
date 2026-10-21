// Anything can be thrown, not just Error; this keeps catch blocks from assuming it.
export function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
