// Named MCP connectors (Settings → Advanced): one per AI app, each with its own token. Shared by the
// Settings form and the server, so both hold a name to the same rule.

export const CONNECTOR_LIMIT = 5;
export const CONNECTOR_NAME_MAX = 40;

export type Connector = { id: number; name: string; createdAt: string; usedAt: string | null };

// The name as stored: trimmed, 1 to 40 characters (counted as the database counts them, so an emoji is
// one), or null when it doesn't fit.
export function connectorName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  const length = [...name].length;
  return length >= 1 && length <= CONNECTOR_NAME_MAX ? name : null;
}
