import { expect, test } from "@playwright/test";
import { fixtures, guess, signIn } from "./helpers";
import { service } from "../support/db";

test.describe.configure({ mode: "serial" });

const tag = Date.now().toString(36);
const player = { email: `e2e-${tag}@pricele.test`, username: `e2e_${tag}`.slice(0, 20), password: `Passw0rd-${tag}` };

test("guest plays, refreshes, signs up, claims progress and appears on the leaderboard", async ({ page }) => {
  const { todayAnswers } = fixtures();

  // 1. Homepage
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Think you know what things cost?" })).toBeVisible();
  await expect(page.getByText("0 of 3 answered")).toBeVisible();
  await page.getByRole("link", { name: "Play Today's Game", exact: true }).click();
  await expect(page).toHaveURL(/\/play$/);

  // Answers must not be anywhere in the page before guessing.
  const html = await page.content();
  for (const a of ["27500", "27,500", "4000000000", "4,000,000,000"]) expect(html).not.toContain(a);

  // 2. Client validation
  await guess(page, "0");
  await expect(page.getByText("Guesses must be at least $0.01.")).toBeVisible();

  // 3. Easy — exact guess
  await guess(page, "100");
  await expect(page.getByRole("status").filter({ hasText: "You earned 1000 of 1,000 points" })).toBeAttached();
  await expect(page.getByText("Perfect. Spot on.")).toBeVisible();
  await page.getByRole("button", { name: "Next question" }).click();

  // 4. Medium — 30,000 vs 27,500 → 920 points, 9.09% error
  await guess(page, "30,000");
  await expect(page.getByRole("status").filter({ hasText: "You earned 920 of 1,000 points" })).toBeAttached();
  await expect(page.getByText("9.09%", { exact: true })).toBeVisible();

  // Refresh mid-game: progress persists, the next question resumes
  await page.reload();
  await expect(page.getByText("Question 3 of 3")).toBeVisible();
  await expect(page.getByText("920 pts")).toBeVisible();

  // 5. Hard — 2b vs 4b → 591
  await guess(page, "2b");
  await expect(page.getByRole("status").filter({ hasText: "You earned 591 of 1,000 points" })).toBeAttached();
  await page.getByRole("button", { name: "See your results" }).click();

  // 6. Results
  await expect(page).toHaveURL(/\/results$/);
  await expect(page.getByText("2,511", { exact: true })).toBeVisible();
  await expect(page.getByText("out of 3,000 points")).toBeVisible();
  await page.reload();
  await expect(page.getByText("2,511", { exact: true })).toBeVisible();
  // Revisiting /play after finishing goes to results; no second attempt is possible.
  await page.goto("/play");
  await expect(page).toHaveURL(/\/results$/);
  expect(todayAnswers[1]).toBe("27500.00");

  // 7. Sign up from the guest prompt
  await page.getByRole("link", { name: "Create account" }).last().click();
  await page.getByLabel("Email").fill(player.email);
  await page.getByLabel("Username").fill(player.username);
  await page.getByLabel("Password").fill(player.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/results$/);

  // 8. Claim guest progress
  await page.getByRole("button", { name: "Save to my account" }).click();
  await expect(page.getByText(/Saved 1 day of guest progress/)).toBeVisible();
  await page.reload();
  await expect(page.getByText("Save your guest progress")).toHaveCount(0);
  await expect(page.getByText(/#1 of|#\d+ of \d+ today/)).toBeVisible();

  // 9. Profile statistics
  await page.goto("/profile");
  await expect(page.getByText("Games completed").locator("..")).toContainText("1");
  await expect(page.getByText("Total points").locator("..")).toContainText("2,511");
  await expect(page.getByText("Current streak").locator("..")).toContainText("1 day");

  // 10. Leaderboard eligibility
  await page.goto("/leaderboard");
  await expect(page.getByRole("table").getByText(player.username)).toBeVisible();
});

test("archive practice never changes official standings", async ({ page }) => {
  const { yesterday } = fixtures();
  await signIn(page, player.email, player.password);
  const before = (await service.rpc("leaderboard_alltime", { p_username: player.username })).data![0];

  await page.goto("/archive");
  await page.locator(`a[href="/archive/${yesterday}"]`).click();
  await expect(page.getByText(/Practice mode/)).toBeVisible();
  await page.getByLabel(/Practice guess/).first().fill("24");
  await page.getByRole("button", { name: /Check my guess/ }).first().click();
  await expect(page.getByText("Practice result — not counted on leaderboards")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "You earned 591 of 1,000 points" })).toBeAttached();

  // "Just show me the answer" reveals without recording a guess
  await page.getByRole("button", { name: "Just show me the answer" }).first().click();
  await expect(page.getByText("Answer revealed")).toBeVisible();

  const after = (await service.rpc("leaderboard_alltime", { p_username: player.username })).data![0];
  expect(after.total_score).toBe(before.total_score);
  expect(after.games_completed).toBe(before.games_completed);
  const { data: stats } = await service.rpc("get_player_stats", { p_user_id: (await service.from("profiles").select("id").eq("username", player.username).single()).data!.id });
  expect((stats as { current_streak: number }).current_streak).toBe(1);
});

test("sign out and back in keeps account data", async ({ page }) => {
  await signIn(page, player.email, player.password, "/profile");
  await page.getByRole("button", { name: /account menu/ }).click();
  await page.getByRole("banner").getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/login\?next=(%2F|\/)profile$/);
  await page.getByLabel("Email").fill(player.email);
  await page.getByLabel("Password").fill(player.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByText("Total points").locator("..")).toContainText("2,511");
});

test("wrong password shows a generic error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(player.email);
  await page.getByLabel("Password").fill("not-the-password1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();
});

test("open redirects through ?next= are refused", async ({ page }) => {
  await signIn(page, player.email, player.password, "https://evil.example/");
  await expect(page).toHaveURL(/localhost:\d+\/$/);
});
