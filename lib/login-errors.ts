// ?error= carries a code, never free text, so a crafted link can't put its own words on the page.
export const LOGIN_ERRORS = {
  denied: "Sign-in was cancelled on Tesla.",
  expired: "Sign-in expired. Try again.",
  failed: "Couldn't complete Sign in with Tesla. Try again.",
  "not-owner": "This Tesla account isn't the owner of this dashboard.",
} as const;

export type LoginErrorCode = keyof typeof LOGIN_ERRORS;

export function loginErrorMessage(code: string | null | undefined): string | null {
  return code && code in LOGIN_ERRORS ? LOGIN_ERRORS[code as LoginErrorCode] : null;
}
