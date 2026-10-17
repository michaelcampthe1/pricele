import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { log } from "@/lib/errors/log";

export const LIMITS = {
  officialGuess: { limit: 30, windowSeconds: 60 },
  practiceGuess: { limit: 40, windowSeconds: 60 },
  guestCreate: { limit: 20, windowSeconds: 3600 },
  auth: { limit: 10, windowSeconds: 300 },
  passwordReset: { limit: 5, windowSeconds: 3600 },
  claim: { limit: 10, windowSeconds: 3600 },
  feedback: { limit: 5, windowSeconds: 3600 },
  ai: { limit: 10, windowSeconds: 3600 },
  admin: { limit: 120, windowSeconds: 60 },
} as const;

/**
 * Fixed-window limiter stored in Postgres, so it is shared by every serverless instance.
 * Limits are generous enough that a legitimate retry never trips them; official submissions
 * are idempotent anyway. If the limiter itself is unavailable we allow the request (the
 * operation that follows needs the same database and will fail cleanly on its own).
 */
export async function rateLimit(
  bucket: keyof typeof LIMITS,
  subject: string,
): Promise<boolean> {
  const { limit, windowSeconds } = LIMITS[bucket];
  const { data, error } = await createServiceClient().rpc("check_rate_limit", {
    p_key: `${bucket}:${subject}`,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    await log("warn", "rate_limit.unavailable", { bucket, error: error.message });
    return true;
  }
  return data === true;
}
