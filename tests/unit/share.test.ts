import { describe, expect, it } from "vitest";
import { buildShareText, scoreBar } from "@/lib/share";

describe("share text", () => {
  it("includes scores, total and streak but never answers", () => {
    const text = buildShareText({ gameDate: "2026-10-16", easy: 812, medium: 591, hard: 303, streak: 4 });
    expect(text).toContain("Pricele — October 16");
    expect(text).toContain("Easy: 812/1,000");
    expect(text).toContain("Total: 1,706/3,000");
    expect(text).toContain("Streak: 4 days");
    expect(text).not.toMatch(/\$/);
  });

  it("omits a zero streak and uses singular for one day", () => {
    expect(buildShareText({ gameDate: "2026-10-16", easy: 1, medium: 1, hard: 1, streak: 0 })).not.toContain("Streak");
    expect(buildShareText({ gameDate: "2026-10-16", easy: 1, medium: 1, hard: 1, streak: 1 })).toContain("Streak: 1 day");
  });

  it("renders a proportional bar", () => {
    expect(scoreBar(1000)).toBe("🟩🟩🟩🟩🟩");
    expect(scoreBar(0)).toBe("⬜⬜⬜⬜⬜");
    expect(scoreBar(591)).toBe("🟩🟩🟩⬜⬜");
  });
});
