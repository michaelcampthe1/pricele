import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env.server";

/**
 * Server-issued guest sessions.
 *   * Token: 32 random bytes (base64url) in an HttpOnly, SameSite=Lax cookie (Secure in prod).
 *   * Database: only SHA-256(token) is stored; the raw token is never persisted or logged.
 *   * Lifetime: 30 days. Claimed or revoked sessions are rejected.
 */
export const GUEST_COOKIE = "pricele_guest";
const LIFETIME_DAYS = 30;

export function hashGuestToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export type GuestSession = { id: string; expiresAt: string; claimed: boolean };

async function lookup(token: string): Promise<(GuestSession & { usable: boolean }) | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const { data } = await createServiceClient()
    .from("guest_sessions")
    .select("id, expires_at, claimed_at, revoked_at")
    .eq("token_hash", hashGuestToken(token))
    .maybeSingle();
  if (!data) return null;
  const usable =
    data.claimed_at === null && data.revoked_at === null && new Date(data.expires_at) > new Date();
  return { id: data.id, expiresAt: data.expires_at, claimed: data.claimed_at !== null, usable };
}

/** The current request's usable guest session, if any. Never creates one. */
export async function getGuestSession(): Promise<GuestSession | null> {
  const token = (await cookies()).get(GUEST_COOKIE)?.value;
  if (!token) return null;
  const found = await lookup(token);
  return found?.usable ? { id: found.id, expiresAt: found.expiresAt, claimed: false } : null;
}

/**
 * Returns the current guest session or issues a new one. Only callable where cookies are
 * writable (Server Actions, Route Handlers).
 */
export async function getOrCreateGuestSession(): Promise<GuestSession> {
  const existing = await getGuestSession();
  if (existing) return existing;

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + LIFETIME_DAYS * 86_400_000);
  const { data, error } = await createServiceClient()
    .from("guest_sessions")
    .insert({ token_hash: hashGuestToken(token), expires_at: expiresAt.toISOString() })
    .select("id, expires_at")
    .single();
  if (error || !data) throw new Error("guest_session_create_failed");

  (await cookies()).set(GUEST_COOKIE, token, {
    httpOnly: true,
    secure: serverEnv().isProduction,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return { id: data.id, expiresAt: data.expires_at, claimed: false };
}

export async function clearGuestCookie() {
  (await cookies()).delete(GUEST_COOKIE);
}
