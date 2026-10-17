/**
 * Error catalogue. Database functions return stable error codes; this maps them to messages
 * that are safe and useful to show players. Internal details are logged, never returned.
 */
export const ERROR_MESSAGES = {
  invalid_guess: "Enter a dollar amount between $0.01 and $1 quadrillion.",
  invalid_identity: "We couldn't identify your session. Refresh the page and try again.",
  guest_session_invalid: "Your guest session has expired. Refresh the page to start a new one.",
  guest_session_already_claimed: "This guest progress has already been saved to an account.",
  unauthorized: "Please sign in to continue.",
  forbidden: "You don't have permission to do that.",
  account_suspended: "This account is suspended. Contact the Pricele team if you think this is a mistake.",
  question_not_found: "That question doesn't exist.",
  question_not_current: "That question isn't part of today's game anymore. Refresh to load the current game.",
  set_not_published: "Today's game isn't available yet.",
  question_withdrawn: "This question was withdrawn and isn't scored.",
  answer_unavailable: "This question can't be scored right now. Please try again later.",
  already_played_official: "You already played this question officially, so your original result stands.",
  practice_not_available: "Practice is only available for past games.",
  invalid_date: "That date isn't valid.",
  rate_limited: "You're going a little fast. Wait a moment and try again.",
  unavailable: "Something went wrong on our side. Please try again.",
  not_configured: "This feature isn't configured yet.",
} as const;

export type ErrorCode = keyof typeof ERROR_MESSAGES;

export function messageFor(code: string | null | undefined): string {
  if (code && code in ERROR_MESSAGES) return ERROR_MESSAGES[code as ErrorCode];
  return ERROR_MESSAGES.unavailable;
}

export type ActionResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: string; message: string; fieldErrors?: Record<string, string> };

export function fail(code: string, fieldErrors?: Record<string, string>) {
  return { ok: false as const, error: code, message: messageFor(code), fieldErrors };
}
