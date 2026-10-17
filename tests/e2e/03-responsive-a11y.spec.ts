import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fixtures } from "./helpers";

const WIDTHS = [360, 390, 768, 1024, 1440];
const PAGES = ["/", "/play", "/archive", `/archive/${"YESTERDAY"}`, "/leaderboard", "/leaderboard?view=alltime", "/login", "/signup", "/about", "/privacy"];

for (const width of WIDTHS) {
  test(`no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of PAGES) {
      await page.goto(path.replace("YESTERDAY", fixtures().yesterday));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(0);
    }
  });
}

test("key pages have no serious accessibility violations", async ({ page }) => {
  for (const path of PAGES) {
    await page.goto(path.replace("YESTERDAY", fixtures().yesterday));
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${path}: ${v.id} — ${v.nodes[0]?.target}`)).toEqual([]);
  }
});

test("a full question can be played on a 360px phone", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto("/play");
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Leaderboard" })).toBeVisible();
  await page.getByRole("button", { name: "Close menu" }).click();
  const input = page.getByLabel(/Your guess/);
  await expect(input).toBeInViewport();
  await input.fill("5");
  await page.getByRole("button", { name: /Lock in guess/ }).click();
  await expect(page.getByRole("button", { name: "Next question" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await context.close();
});
