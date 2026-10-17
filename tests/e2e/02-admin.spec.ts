import { expect, test } from "@playwright/test";
import { fixtures, guess, signIn } from "./helpers";
import { createUser, createVerifiedQuestion, service, today, uniqueFutureDate } from "../support/db";

test.describe.configure({ mode: "serial" });

test("non-admins cannot reach the dashboard", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login\?next=(%2F|\/)admin$/);
  const user = await createUser("plain");
  await signIn(page, user.email, user.password);
  const res = await page.goto("/admin");
  expect(res?.status()).toBe(404);
  const res2 = await page.goto("/admin/questions/new");
  expect(res2?.status()).toBe(404);
});

test("admin creates, verifies, schedules and corrects questions", async ({ page, browser }) => {
  const { admin } = fixtures();
  await signIn(page, admin.email, admin.password, "/admin");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  // Create a draft through the editor
  const prompt = `E2E: How much does the reference widget cost at the reference store? ${Date.now()}`;
  await page.goto("/admin/questions/new");
  await page.getByLabel("Question", { exact: true }).fill(prompt);
  await page.getByLabel("Context (optional)").fill("Use the list price on the reference date.");
  await page.getByLabel("Category").selectOption({ label: "Everyday products" });
  await page.getByLabel("Target amount (USD)").fill("49.99");
  await page.getByLabel("Exact definition").fill("Retail list price");
  await page.getByLabel("Reference date").fill("2026-10-01");
  await page.getByLabel("Explanation shown after the reveal").fill("E2E explanation.");
  await page.getByRole("button", { name: "Save question" }).click();
  await expect(page.getByText("Draft created.")).toBeVisible();
  const questionId = page.url().match(/questions\/([0-9a-f-]{36})/)![1];

  // Verification is refused without a source
  await page.getByLabel(/I opened the sources/).check();
  await page.getByRole("button", { name: "Mark verified" }).click();
  await expect(page.getByText(/Attach at least one source/)).toBeVisible();

  // Attach a source, verify, approve
  await page.getByText("Add a source").click();
  await page.getByLabel("Title").fill("Product page");
  await page.getByLabel("Publisher / organization").fill("Reference Store");
  await page.getByLabel("URL", { exact: true }).fill("https://example.com/widget");
  await page.getByLabel("Supporting excerpt").fill("Price: $49.99");
  await page.getByRole("button", { name: "Add source" }).click();
  await expect(page.getByText("Source added.")).toBeVisible();
  await page.reload();
  await page.getByLabel(/I opened the sources/).check();
  await page.getByRole("button", { name: "Mark verified" }).click();
  await expect(page.getByText("Verified.")).toBeVisible();
  await page.getByRole("button", { name: "Approve for scheduling" }).click();
  await expect(page.getByText("Status set to approved.")).toBeVisible();

  // Create a future set; publishing with one question is rejected
  const date = uniqueFutureDate();
  await page.goto("/admin/daily-sets");
  await page.getByLabel("Game date (Eastern Time)").fill(date);
  await page.getByRole("button", { name: "Create draft set" }).click();
  await expect(page.getByRole("heading", { name: /\d{4}$/ })).toBeVisible();
  await page.getByLabel("Question for position 1").selectOption(questionId);
  await page.getByRole("button", { name: "Assign" }).first().click();
  await expect(page.getByText("Assigned.")).toBeVisible();
  await page.reload();
  await page.getByLabel(`Type ${date}`).fill(date);
  await page.getByRole("button", { name: "Publish set" }).click();
  await expect(page.getByText(/The set failed validation\. .*Assign exactly three questions/)).toBeVisible();

  // Fill positions 2 and 3, then publish with confirmation
  const medium = await createVerifiedQuestion(admin.id, "medium", "777.00");
  const hard = await createVerifiedQuestion(admin.id, "hard", "88888888.00");
  await page.reload();
  await page.getByLabel("Question for position 2").selectOption(medium);
  await page.getByRole("button", { name: "Assign" }).first().click();
  await expect(page.getByText("Assigned.")).toBeVisible();
  await page.reload();
  await page.getByLabel("Question for position 3").selectOption(hard);
  await page.getByRole("button", { name: "Assign" }).first().click();
  await expect(page.getByText("Assigned.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("All checks pass")).toBeVisible();
  await page.getByLabel(`Type ${date}`).fill("2000-01-01");
  await page.getByRole("button", { name: "Publish set" }).click();
  await expect(page.getByText("Type the set's exact game date to confirm.")).toBeVisible();
  await page.getByLabel(`Type ${date}`).fill(date);
  await page.getByRole("button", { name: "Publish set" }).click();
  await expect(page.getByText(/Scheduled\. It goes live at midnight/)).toBeVisible();

  // Future scheduled games are invisible to players
  const anon = await browser.newPage();
  const res = await anon.goto(`/archive/${date}`);
  expect(res?.status()).toBe(404);
  await anon.close();

  // Correction workflow on a live question (today's fixture set)
  const { data: todaySet } = await service.from("daily_sets").select("id, daily_set_questions(question_id, position)").eq("game_date", today()).eq("status", "published").single();
  const easyToday = (todaySet!.daily_set_questions as { question_id: string; position: number }[]).find((q) => q.position === 1)!.question_id;
  await page.goto(`/admin/questions/${easyToday}`);
  await page.getByLabel(/New answer/).fill("110");
  await page.getByLabel("Internal reason").first().fill("Source showed the price after tax.");
  await page.getByLabel("Supporting source URL").fill("https://example.com/corrected");
  await page.getByLabel("Public correction note").fill("Corrected to the pre-tax list price.");
  await page.getByLabel("Type CORRECT to confirm").fill("CORRECT");
  await page.getByRole("button", { name: "Apply correction" }).click();
  await expect(page.getByText(/Correction applied\. \d+ official attempts were rescored/)).toBeVisible();
  await expect(page.getByText("Correction history")).toBeVisible();
});

test("a set published for today is immediately playable and keeps answers hidden", async ({ page, browser }) => {
  const { admin } = fixtures();
  // Move today's fixture set out of the way, then publish a new set through the UI.
  await service.from("daily_sets").update({ status: "withdrawn", withdrawn_at: new Date().toISOString(), withdrawn_reason: "e2e" }).eq("game_date", today()).neq("status", "withdrawn");
  const ids = [
    await createVerifiedQuestion(admin.id, "easy", "3.50"),
    await createVerifiedQuestion(admin.id, "medium", "65432.10"),
    await createVerifiedQuestion(admin.id, "hard", "987654321.00"),
  ];
  await signIn(page, admin.email, admin.password, "/admin/daily-sets");
  await page.getByLabel("Game date (Eastern Time)").fill(today());
  await page.getByRole("button", { name: "Create draft set" }).click();
  await expect(page.getByText("Publication checks")).toBeVisible();
  for (const [i, id] of ids.entries()) {
    await page.getByLabel(`Question for position ${i + 1}`).selectOption(id);
    await page.getByRole("button", { name: "Assign" }).first().click();
    await expect(page.getByText("Assigned.")).toBeVisible();
    await page.reload();
  }
  await page.getByLabel(`Type ${today()}`).fill(today());
  await page.getByRole("button", { name: "Publish set" }).click();
  await expect(page.getByText("Published — it's live now.")).toBeVisible();

  const player = await (await browser.newContext()).newPage();
  await player.goto("/play");
  const html = await player.content();
  for (const a of ["65432", "65,432", "987654321", "987,654,321"]) expect(html).not.toContain(a);
  await guess(player, "3.50");
  await expect(player.getByRole("status").filter({ hasText: "You earned 1000 of 1,000 points" })).toBeAttached();
});

test("the cron endpoint requires the bearer secret", async ({ request }) => {
  expect((await request.get("/api/cron/daily")).status()).toBe(401);
  expect((await request.get("/api/cron/daily", { headers: { authorization: "Bearer wrong" } })).status()).toBe(401);
  const ok = await request.get("/api/cron/daily", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  expect(ok.status()).toBe(200);
  const body = await ok.json();
  expect(body.ok).toBe(true);
  expect(body.upcoming).toHaveLength(7);
});
