import { afterEach, describe, expect, it } from "vitest";
import { appUrl } from "@/lib/env";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("appUrl", () => {
  it("prefers NEXT_PUBLIC_APP_URL and strips a trailing slash", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://pricele.com/";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "pricele.vercel.app";
    expect(appUrl()).toBe("https://pricele.com");
  });

  it("falls back to Vercel's production address, then localhost", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "pricele-abc.vercel.app";
    expect(appUrl()).toBe("https://pricele-abc.vercel.app");
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    expect(appUrl()).toBe("http://localhost:3000");
  });
});
