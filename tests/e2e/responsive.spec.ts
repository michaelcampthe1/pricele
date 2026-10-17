import { expect, test } from "@playwright/test";

const WIDTHS = [360, 390, 768, 1024, 1440];
const PATHS = ["/", "/play", "/archive", "/leaderboard", "/leaderboard?view=alltime", "/login", "/signup", "/about", "/privacy"];

for (const width of WIDTHS) {
  test(`no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of PATHS) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(0);
    }
    // An archive game page
    await page.goto("/archive");
    await page.getByRole("link").filter({ hasText: /Play|Practiced|Played/ }).first().click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("keyboard users can reach the main navigation and skip link", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
});
