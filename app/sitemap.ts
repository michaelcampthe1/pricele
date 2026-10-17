import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/env";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = appUrl();
  return ["", "/archive", "/leaderboard", "/about", "/privacy", "/terms"].map((p) => ({
    url: `${base}${p}`,
    changeFrequency: p === "" || p === "/leaderboard" ? "daily" : "weekly",
  }));
}
