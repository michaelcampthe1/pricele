import "server-only";
import { headers } from "next/headers";
import { createHash } from "node:crypto";

/** Best-effort client IP, hashed so raw IPs never land in the rate-limit table. */
export async function clientKey(): Promise<string> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
  return createHash("sha256").update(`pricele:${ip}`).digest("hex").slice(0, 32);
}

export async function requestId(): Promise<string | null> {
  return (await headers()).get("x-request-id");
}
