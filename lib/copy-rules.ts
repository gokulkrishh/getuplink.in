// The checkable parts of AGENTS.md "Writing copy" and the uplink-copy skill, as patterns. test/copy-rules.test.ts
// runs RULES over the app's screens; evals/ runs both lists over AI-written text.

export const RULES: [RegExp, string][] = [
  [/\bOops\b/i, "no 'Oops'"],
  [/\w!(\s|$)/, "no exclamation marks"],
  [/→|←|\s–\s|\s—\s/, "no arrows or dashes between words; write '58% to 51%'"],
  [/\b(color|colors|kilometer|kilometers|meter|meters|center|centered|license)\b/, "Indian/British spelling: colour, kilometre, metre, centre, licence"],
  [/\b(\d+)\s*-\s*(\d+)\s*(km|%|kWh|km\/h)\b/, "a range reads '30 to 45 km/h'"],
];

// Words an owner never reads (the skill's "Never on screen" list and its "Say this, not that" table).
export const OWNER_WORD_RULES: [RegExp, string][] = [
  [/\b(API|endpoint|payload|cron|null|undefined|NaN|telemetry|median|percentile|fleet|LLM|OTA|firmware|SoH)\b/i, "technical word"],
  [/\b(streams?|streamed|streaming|readings?|signals?|poll(s|ed|ing)?|tokens?)\b/i, "technical word (say 'data' or 'figures')"],
  [/\b(log ?in|log ?out|login|logout)\b/i, "'Sign in' and 'Sign out'"],
  [/(?<!full[- ])\bpack\b/i, "'battery', not 'pack'"],
  [/\bsessions?\b/i, "'charge', not 'session'"],
  [/\bvehicles?\b/i, "'car', not 'vehicle'"],
  [/\b(Avg|e\.g\.|etc|vs)\b/, "write words out"],
  [/\b(please|sorry|simply|just|easily|successfully)\b/i, "no filler words"],
  [/\b(may have been|might possibly|in order to)\b/i, "no hedges or filler"],
  [/\bSentry mode\b/, "Sentry Mode keeps its case"],
  [/[a-z]; [a-z]/, "no semicolons joining sentences"],
];

// The rules text breaks, as short reasons.
export function copyViolations(text: string): string[] {
  return [...RULES, ...OWNER_WORD_RULES].filter(([rule]) => rule.test(text)).map(([, why]) => why);
}
