import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/archive", "/leaderboard", "/about", "/privacy", "/terms", "/profile/"],
        disallow: ["/admin", "/api/", "/profile$", "/play", "/results", "/claim", "/login", "/signup", "/forgot-password", "/reset-password", "/auth/", "/share/"],
      },
    ],
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
