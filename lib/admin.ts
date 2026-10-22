// ADMIN_ACCOUNTS: comma-separated Tesla account ids (the id_token `sub` stored as oauth_tokens.owner_sub)
// allowed to open /admin. Blank entries and spaces are ignored; unset means nobody is an admin.
export function parseAdminAccounts(value: string | undefined): Set<string> {
  return new Set((value ?? "").split(",").map((s) => s.trim()).filter(Boolean));
}

export function isAdminAccount(sub: string | null | undefined, allowed: Set<string>): boolean {
  return Boolean(sub) && allowed.has(sub as string);
}
