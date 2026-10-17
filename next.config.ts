import type { NextConfig } from "next";

// Security headers applied to every route. A strict nonce-based CSP is left as a
// documented follow-up because it interacts with ad providers chosen later.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
];

const nextConfig: NextConfig = {
  // Pricele's pages are personalized and date-dependent; we render them per request and
  // never cache answer-bearing or personalized responses. See README "Caching".
  cacheComponents: false,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  serverExternalPackages: ["postgres"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/(admin|profile|play|results|api)(.*)", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
