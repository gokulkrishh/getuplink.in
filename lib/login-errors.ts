// ?error= carries a code, never free text, so a crafted link can't put its own words on the page.
export const LOGIN_ERRORS = {
  denied: "Sign-in was cancelled. Sign in again to continue.",
  expired: "Sign-in expired. Try again.",
  failed: "Couldn't sign you in with Tesla. Try again.",
  "not-owner": "This dashboard belongs to another Tesla account. Sign in with the account that set up Uplink.",
} as const;

export type LoginErrorCode = keyof typeof LOGIN_ERRORS;

export function loginErrorMessage(code: string | null | undefined): string | null {
  return code && code in LOGIN_ERRORS ? LOGIN_ERRORS[code as LoginErrorCode] : null;
}
