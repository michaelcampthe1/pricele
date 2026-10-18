import { expect, test, type Page } from "@playwright/test";
import { db, todaysAnswers } from "./support/db";

test.describe.configure({ mode: "serial" });

const username = `e2e_${Date.now().toString(36)}`;
const email = `${username}@example.test`;
const password = "correct-horse-42";

async function answerCurrent(page: Page, guess: string) {
  await page.getByLabel("Your guess").fill(guess);
  await page.getByRole("button", { name: "Submit guess" }).click();
  await expect(page.getByText("Points earned")).toBeVisible();
}

test("guest plays today's game end to end, then claims it into a new account", async ({ page, request }) => {
  // 1. Homepage
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Think you know what things cost?" })).toBeVisible();
  await expect(page.getByText("Up to 3,000 points")).toBeVisible();

  // Answers are not present anywhere in the served HTML/RSC payload before submission.
  const answers = await todaysAnswers();
  expect(answers).toHaveLength(3);
  const html = await (await request.get("/play")).text();
  for (const a of answers) {
    expect(html).not.toContain(a);
    expect(html).not.toContain(Number(a).toLocaleString("en-US"));
  }

  // 2–7. Play all three questions as a guest
  await page.getByRole("link", { name: "Play today's game" }).first().click();
  await expect(page.getByText("Question 1 of 3")).toBeVisible();

  // Client validation
  await page.getByLabel("Your guess").fill("0");
  await page.getByRole("button", { name: "Submit guess" }).click();
  await expect(page.getByText("Guesses must be greater than $0.")).toBeVisible();

  // Commas are inserted while typing
  await page.getByLabel("Your guess").fill("");
  await page.getByLabel("Your guess").pressSequentially("1234567");
  await expect(page.getByLabel("Your guess")).toHaveValue("1,234,567");

  await answerCurrent(page, answers[0]); // exact
  await expect(page.getByText("Spot on.")).toBeVisible();
  await expect(page.locator("p", { hasText: "Points earned" }).locator("..")).toContainText("1,000");
  await page.getByRole("button", { name: "Next question" }).click();
  await answerCurrent(page, String(Number(answers[1]) * 2)); // twice → 591
  await page.getByRole("button", { name: "Next question" }).click();
  await answerCurrent(page, String(Number(answers[2]) / 10)); // tenth → 303
  await page.getByRole("button", { name: "See your results" }).click();

  await expect(page).toHaveURL(/\/results$/);
  await expect(page.getByText("1,894")).toBeVisible();
  await expect(page.getByText("You ranked #1 of 1 player today")).toBeVisible();

  // 8–9. Refresh: progress persists (server-side guest session)
  await page.reload();
  await expect(page.getByText("1,894")).toBeVisible();
  await page.goto("/play");
  await expect(page).toHaveURL(/\/results$/); // can't replay

  // Guest isn't on the leaderboard
  await page.goto("/leaderboard");
  await expect(page.getByText("Be the first to make the leaderboard.")).toBeVisible();

  // 10–11. Create an account and claim guest progress
  await page.goto("/results");
  await page.getByRole("link", { name: "Create account" }).last().click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Save your guest results?" })).toBeVisible();
  await expect(page.getByText("You answered 3 questions as a guest")).toBeVisible();
  await page.getByRole("button", { name: "Save to my account" }).click();
  await expect(page).toHaveURL(/\/results/);
  await expect(page.getByText("1,894")).toBeVisible();
  await expect(page.getByText("You ranked #1 of 1 player today")).toBeVisible();
  await expect(page.getByText("1-day streak")).toBeVisible();

  // 12. Profile statistics are real
  await page.goto("/profile");
  await expect(page.getByText(`@${username}`).first()).toBeVisible();
  const stats = page.locator("dl").first();
  await expect(stats).toContainText("1,894");
  await expect(stats).toContainText("1 day");

  // 13. Leaderboard eligibility
  await page.goto("/leaderboard");
  await expect(page.getByRole("link", { name: username })).toBeVisible();
  await expect(page.getByText("You", { exact: true })).toBeVisible();
});

test("archive practice never changes official standings", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/(play|results)/);

  const [{ before }] = await db()`
    select coalesce(sum(total_score), 0)::int as before from public.daily_results dr join public.profiles p on p.id = dr.user_id where p.username = ${username}`;

  await page.goto("/archive");
  await page.getByRole("link").filter({ hasText: "Play" }).first().click();
  await expect(page.getByText("Practice mode.")).toBeVisible();
  await page.getByLabel("Your practice guess").first().fill("100");
  await page.getByRole("button", { name: "Check my guess" }).first().click();
  await expect(page.getByText("Practice score", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Just show the answer" }).first().click();
  await expect(page.getByText("Correct price").first()).toBeVisible();

  const [{ after }] = await db()`
    select coalesce(sum(total_score), 0)::int as after from public.daily_results dr join public.profiles p on p.id = dr.user_id where p.username = ${username}`;
  expect(after).toBe(before);
  const [{ n }] = await db()`
    select count(*)::int as n from public.practice_attempts pa join public.profiles p on p.id = pa.user_id where p.username = ${username}`;
  expect(n).toBe(1);
  await page.goto("/profile");
  await expect(page.locator("dl").first()).toContainText("1,894");
});

test("signing out and back in keeps account data", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("wrong-password-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("That email and password combination didn't work.")).toBeVisible();
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/(play|results)/);

  await page.goto("/profile");
  const viewport = page.viewportSize();
  if (viewport && viewport.width < 768) {
    await page.getByRole("button", { name: "Open menu" }).click();
  } else {
    await page.getByRole("button", { name: new RegExp(username) }).click();
  }
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/");
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.goto("/profile");
  await expect(page.locator("dl").first()).toContainText("1,894");
  // Already played today: the play page sends you to results, not a second attempt.
  await page.goto("/play");
  await expect(page).toHaveURL(/\/results$/);
});
