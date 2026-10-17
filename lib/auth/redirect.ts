/**
 * Prevents open redirects: only same-site relative paths are allowed as "next" targets.
 */
export function safeNextPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  if (/[\u0000-\u001f]/.test(value)) return fallback;
  try {
    const u = new URL(value, "http://pricele.invalid");
    if (u.origin !== "http://pricele.invalid") return fallback;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return fallback;
  }
}
