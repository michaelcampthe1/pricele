"use server";

import { unstable_rethrow } from "next/navigation";
import { redirect } from "next/navigation";
import { getFreshUser } from "@/lib/auth/session";
import { clearGuestCookie, readGuestHash } from "@/lib/auth/guest";
import { claimGuestSession } from "@/lib/game/service";
import { safeNextPath } from "@/lib/auth/redirect";
import { logger } from "@/lib/logger";

export type ClaimState = { error?: string };

const MESSAGES: Record<string, string> = {
  unauthorized: "Sign in again to save your guest results.",
  no_guest_session: "We couldn't find guest results on this device.",
  already_claimed: "These guest results were already saved to an account.",
  guest_expired: "This guest session expired, so its results can't be transferred.",
};

export async function claimAction(_prev: ClaimState, formData: FormData): Promise<ClaimState> {
  const next = safeNextPath(formData.get("next"), "/profile");
  const user = await getFreshUser();
  if (!user) return { error: MESSAGES.unauthorized };
  const hash = await readGuestHash();
  if (!hash) return { error: MESSAGES.no_guest_session };
  let result;
  try {
    result = await claimGuestSession(user.id, hash);
  } catch (err) {
    unstable_rethrow(err);
    logger.error("claim.failed", { error: String(err) });
    return { error: "Something went wrong. Nothing was transferred — try again." };
  }
  if (!result.ok) {
    if (result.error === "already_claimed" || result.error === "guest_expired") await clearGuestCookie();
    return { error: MESSAGES[result.error] ?? "We couldn't transfer these results." };
  }
  await clearGuestCookie();
  logger.info("claim.completed", { sets: result.setsTransferred, attempts: result.attemptsTransferred, skipped: result.setsSkipped });
  const sep = next.includes("?") ? "&" : "?";
  redirect(`${next}${sep}claimed=${result.attemptsTransferred}&skipped=${result.setsSkipped}`);
}

export async function dismissClaimAction(formData: FormData): Promise<void> {
  redirect(safeNextPath(formData.get("next"), "/play"));
}
