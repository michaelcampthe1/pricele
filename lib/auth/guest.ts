import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { createGuestSession } from "@/lib/game/service";
import { serverEnv } from "@/lib/env";

/**
 * Guest sessions: a 256-bit random token in an HttpOnly, SameSite=Lax cookie (Secure in
 * production). Only its SHA-256 hash is stored in the database. Sessions are created
 * lazily on a guest's first official guess, not on page views.
 */
export const GUEST_COOKIE = process.env.NODE_ENV === "production" ? "__Host-pricele_guest" : "pricele_guest";

export function hashGuestToken(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}

function isWellFormed(token: string | undefined): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}

/** Hash of the guest token from the request cookie, if present and well-formed. */
export async function readGuestHash(): Promise<Buffer | null> {
  const token = (await cookies()).get(GUEST_COOKIE)?.value;
  return isWellFormed(token) ? hashGuestToken(token) : null;
}

/** Creates a new server-issued guest session and sets its cookie. Server actions only. */
export async function issueGuestSession(): Promise<Buffer> {
  const ttlDays = serverEnv().GUEST_SESSION_TTL_DAYS;
  const token = randomBytes(32).toString("base64url");
  const hash = hashGuestToken(token);
  await createGuestSession(hash, ttlDays);
  (await cookies()).set(GUEST_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ttlDays * 24 * 60 * 60,
  });
  return hash;
}

export async function clearGuestCookie() {
  (await cookies()).delete(GUEST_COOKIE);
}
