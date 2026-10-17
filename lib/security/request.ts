import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";

/** A privacy-preserving client key (hashed IP) for rate limiting. */
export async function clientKey(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || h.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`pricele:${ip}`).digest("hex").slice(0, 32);
}
