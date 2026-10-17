import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/redirect";
import { isSupabaseConfigured } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Handles OAuth (PKCE `code`) and email links (`token_hash` + `type`: signup confirmation,
 * password recovery, email change). Redirect targets are restricted to same-site paths.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNextPath(url.searchParams.get("next"), "/play");
  const fail = NextResponse.redirect(new URL("/login?error=callback", url.origin));
  if (!isSupabaseConfigured()) return fail;

  const supabase = await createSupabaseServerClient();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  try {
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
    } else if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      if (error) throw error;
    } else {
      return fail;
    }
  } catch (err) {
    logger.warn("auth.callback_failed", { error: err instanceof Error ? err.message : String(err) });
    return fail;
  }

  const destination = type === "recovery" ? "/reset-password" : next;
  // OAuth sign-ins go through the claim step when guest progress exists.
  const claimAware = destination.startsWith("/claim") || destination === "/reset-password" ? destination : `/claim?next=${encodeURIComponent(destination)}`;
  return NextResponse.redirect(new URL(claimAware, url.origin));
}
