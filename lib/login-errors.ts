// ?error= carries a code, never free text, so a crafted link can't put its own words on the page.
export const LOGIN_ERRORS = {
  denied: "Sign-in was cancelled. Sign in again to continue.",
  expired: "Sign-in expired. Try again.",
  failed: "Couldn't sign you in with Tesla. Try again.",
  "not-owner": "Sign-up is closed. Only approved Tesla accounts can sign in.",
  "invite-only": "Uplink is invite-only for now. Open your invite link to sign in.",
  "invite-invalid": "This invite link has expired or was already used. Ask for a new one.",
  "invite-car": "This invite is for a different car. Sign in with the Tesla account that has the invited car.",
  full: "Uplink is full for now. Sign in again later to check.",
  "not-approved": "This Tesla account can't use Uplink right now.",
  region: "Uplink is for Tesla accounts in India and Asia-Pacific only.",
} as const;

export type LoginErrorCode = keyof typeof LOGIN_ERRORS;

export function loginErrorMessage(code: string | null | undefined): string | null {
  return code && code in LOGIN_ERRORS ? LOGIN_ERRORS[code as LoginErrorCode] : null;
}
