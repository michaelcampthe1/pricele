import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/security/redirect";
import { hashGuestToken } from "@/lib/security/guest";
import { buildShareText } from "@/lib/share";
import { passwordSchema, usernameSchema } from "@/lib/validation";

describe("safeNextPath (open-redirect protection)", () => {
  it("keeps same-origin relative paths", () => {
    expect(safeNextPath("/results")).toBe("/results");
    expect(safeNextPath("/archive/2026-10-01?x=1#top")).toBe("/archive/2026-10-01?x=1#top");
  });
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "\\\\evil", "javascript:alert(1)", "evil.example", "/%0d%0aSet-Cookie:x", "/\u0000", "", undefined, 42])(
    "rejects %j",
    (value) => {
      const out = safeNextPath(value, "/");
      expect(out.startsWith("/")).toBe(true);
      expect(out.startsWith("//")).toBe(false);
      expect(out).not.toContain("evil.example\u0000");
      if (typeof value === "string" && /evil/.test(value)) expect(out).toBe("/");
    },
  );
});

describe("guest token hashing", () => {
  it("is a deterministic SHA-256 hex digest that never equals the token", () => {
    const token = "a".repeat(43);
    const h = hashGuestToken(token);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe(hashGuestToken(token));
    expect(h).not.toContain(token);
  });
});

describe("share text", () => {
  it("is spoiler-free and uses the saved scores", () => {
    const text = buildShareText({ gameDate: "2026-10-16", scores: { easy: 846, medium: 591, hard: 303 }, total: 1740, max: 3000, streak: 4, url: "https://pricele.example" });
    expect(text).toBe(["Pricele — Oct 16", "Easy: 846/1,000", "Medium: 591/1,000", "Hard: 303/1,000", "Total: 1,740/3,000", "Streak: 4 days", "Can you beat my score?", "https://pricele.example"].join("\n"));
    expect(text).not.toMatch(/\$/);
  });
  it("omits the streak line when there is none", () => {
    const text = buildShareText({ gameDate: "2026-10-16", scores: { easy: 1, medium: 2, hard: 3 }, total: 6, max: 3000, streak: 0, url: "u" });
    expect(text).not.toContain("Streak");
  });
});

describe("account validation", () => {
  it("normalizes and restricts usernames", () => {
    expect(usernameSchema.parse("  Price_Fan9 ")).toBe("price_fan9");
    for (const bad of ["ab", "a".repeat(21), "has space", "émoji", "admin", "with-dash"]) {
      expect(usernameSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
  it("requires 8+ chars with a letter and a number", () => {
    expect(passwordSchema.safeParse("abcdefg1").success).toBe(true);
    for (const bad of ["short1", "abcdefgh", "12345678"]) expect(passwordSchema.safeParse(bad).success, bad).toBe(false);
  });
});
