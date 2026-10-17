import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return ["", "/play", "/archive", "/leaderboard", "/about", "/privacy", "/terms"].map((path) => ({
    url: `${base}${path}`,
    changeFrequency: path === "/play" || path === "" ? "daily" : "weekly",
  }));
}
