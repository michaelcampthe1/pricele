/**
 * Returns a same-origin relative path, or the fallback. Prevents open redirects through
 * `next=` parameters: rejects absolute URLs, protocol-relative URLs and backslash tricks.
 */
export function safeNextPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\\]/.test(value)) return fallback;
  try {
    const url = new URL(value, "http://pricele.invalid");
    if (url.origin !== "http://pricele.invalid") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
