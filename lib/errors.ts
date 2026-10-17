import type { SubmitError } from "@/lib/game/types";

/** Player-facing messages for every controlled error state. */
export const SUBMIT_ERROR_MESSAGES: Record<SubmitError | "server_error" | "invalid_request", string> = {
  invalid_guess: "Enter a dollar amount between $0.01 and $1 quadrillion.",
  guest_expired: "Your guest session expired. Refresh the page to start a new one.",
  unauthorized: "We couldn't confirm who you are. Refresh the page and try again.",
  suspended: "This account can't submit guesses right now. Contact support if you think this is a mistake.",
  question_not_found: "That question doesn't exist.",
  set_not_published: "Today's game isn't available right now.",
  not_current_set: "This question isn't part of today's game anymore. A new game starts at midnight Eastern Time.",
  not_archived: "This question can only be practiced after its day has ended.",
  official_exists: "You already played this question officially, so your original result stands.",
  rate_limited: "You're submitting very quickly. Wait a moment and try again.",
  server_error: "Something went wrong saving your guess. Your guess was not lost — try again.",
  invalid_request: "That request wasn't valid. Refresh the page and try again.",
};
