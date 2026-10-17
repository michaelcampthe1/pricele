"use server";

import { revalidatePath } from "next/cache";
import { getAuthUser } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/admin";
import { clearGuestCookie, getGuestSession } from "@/lib/security/guest";
import { rateLimit } from "@/lib/security/rate-limit";
import { fail, type ActionResult } from "@/lib/errors";
import { log } from "@/lib/errors/log";

/**
 * Moves the current browser's guest progress onto the signed-in account. Ownership is proven
 * by the HttpOnly guest cookie (its hash must match an unclaimed, unexpired session); the
 * transfer itself runs in one database transaction (public.claim_guest_session).
 */
export async function claimGuestProgress(): Promise<ActionResult<{ claimedSets: number; skippedSets: number }>> {
  const user = await getAuthUser();
  if (!user) return fail("unauthorized");
  if (!(await rateLimit("claim", user.id))) return fail("rate_limited");
  const guest = await getGuestSession();
  if (!guest) return fail("guest_session_invalid");

  const { data, error } = await createServiceClient().rpc("claim_guest_session", {
    p_guest_session_id: guest.id,
    p_user_id: user.id,
  });
  if (error) {
    await log("error", "guest_claim.failed", { error: error.message });
    return fail("unavailable");
  }
  const res = data as { ok: boolean; error?: string; claimed_sets?: number; skipped_sets?: number };
  if (!res.ok) return fail(res.error ?? "unavailable");
  await clearGuestCookie();
  await log("info", "guest_claim.completed", { claimedSets: res.claimed_sets, skippedSets: res.skipped_sets });
  revalidatePath("/", "layout");
  return { ok: true, claimedSets: res.claimed_sets ?? 0, skippedSets: res.skipped_sets ?? 0 };
}
