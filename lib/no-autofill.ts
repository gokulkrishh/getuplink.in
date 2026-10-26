// For text fields that aren't sign-in fields (a place's name, an invite label, a cost): the browser's own
// suggestions off, and the password managers that ignore autocomplete="off" (1Password, LastPass,
// Bitwarden, Dashlane) told to keep their icon out of the field. Spread onto an <input> or <Input>.
export const NO_AUTOFILL = {
  autoComplete: "off",
  "data-1p-ignore": "true",
  "data-lpignore": "true",
  "data-bwignore": "true",
  "data-form-type": "other",
} as const;
