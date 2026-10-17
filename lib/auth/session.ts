import "server-only";
import { unstable_rethrow } from "next/navigation";
import { cache } from "react";
import { isSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export type SessionUser = { id: string; email: string | null };

/**
 * Returns the authenticated user for this request, verified by Supabase Auth.
 * `getClaims()` validates the JWT signature (locally with asymmetric signing keys,
 * or via the Auth server otherwise). Use `requireFreshUser()` for sensitive mutations.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims?.sub) return null;
    return { id: data.claims.sub, email: (data.claims.email as string | undefined) ?? null };
  } catch (err) {
    unstable_rethrow(err);
    logger.warn("auth.claims_failed", { error: String(err) });
    return null;
  }
});

/** Round-trips to the Auth server so revoked sessions are rejected. For sensitive actions. */
export async function getFreshUser(): Promise<SessionUser | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  } catch (err) {
    unstable_rethrow(err);
    logger.warn("auth.get_user_failed", { error: String(err) });
    return null;
  }
}
