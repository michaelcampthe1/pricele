import { expect, test } from "@playwright/test";
import { db } from "./support/db";

test.describe.configure({ mode: "serial" });

const stamp = Date.now().toString(36);
const adminName = `admin_${stamp}`;
const adminEmail = `${adminName}@example.test`;
const password = "admin-pass-123";

test("non-admins get a 404 for every admin route and action", async ({ page, request }) => {
  for (const path of ["/admin", "/admin/questions", "/admin/daily-sets", "/admin/sources", "/admin/users"]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(404);
    const body = await res.text();
    expect(body).not.toContain("Publication schedule");
    expect(body).not.toContain("Question pipeline");
  }
  await page.goto("/signup");
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByLabel("Username").fill(adminName);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/play|\/results/);
  const res = await page.goto("/admin");
  expect(res?.status()).toBe(404);
});

test("admin creates, sources, verifies and approves a question; publishes a set; corrects an answer", async ({ page }) => {
  // Controlled bootstrap (the same function the admin script uses).
  const [{ r }] = await db()`select pricele.bootstrap_admin(${adminEmail}, true) as r`;
  expect(r.ok).toBe(true);

  await page.goto("/login");
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/(play|results)/);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  // Create a draft question
  await page.goto("/admin/questions/new");
  await page.getByLabel("Question").fill(`E2E sample: what does the fictional Example Kettle ${stamp} cost at Example Mart?`);
  await page.getByLabel("Image link").fill("/items/phone.svg");
  await page.getByLabel("Describe the picture").fill("Illustration used by the end-to-end test");
  await page.getByLabel("Difficulty").selectOption("easy");
  await page.getByLabel("Category").selectOption({ label: "Everyday products" });
  await page.getByLabel("Target amount (USD)").fill("49.99");
  await page.getByLabel("What the amount measures").fill("Regular shelf price (fictional test data)");
  await page.getByLabel("Reference date").fill("2026-10-01");
  await page.getByLabel("Explanation shown with the answer").fill("Fictional test data used by the end-to-end suite.");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByText("Draft created.")).toBeVisible();

  // Verification is blocked without a source
  await page.getByLabel(/I opened the source/).check();
  await page.getByRole("button", { name: "Mark answer verified" }).click();
  await expect(page.getByText("At least one source is required").first()).toBeVisible();

  // Attach a source
  await page.getByLabel("Title").fill("Fictional shelf listing");
  await page.getByLabel("Publisher or organization").fill("Example Mart (fictional)");
  await page.getByLabel("URL", { exact: true }).fill("https://example.com/kettle");
  await page.getByLabel("Supporting excerpt").fill("Example Kettle — $49.99 (fictional)");
  await page.getByRole("button", { name: "Add source" }).click();
  await expect(page.getByText("Source added.")).toBeVisible();

  await page.getByLabel(/I opened the source/).check();
  await page.getByRole("button", { name: "Mark answer verified" }).click();
  // The workflow panel advances: verification done → approval available.
  await expect(page.getByText("3. Answer verified ✓")).toBeVisible();
  await page.getByRole("button", { name: "Approve question" }).click();
  await expect(page.getByText("4. Approved ✓")).toBeVisible();

  // Create a set two days ahead
  const [{ d }] = await db()`select (pricele.current_game_date() + 2)::text as d`;
  await page.goto(`/admin/daily-sets?date=${d}`);
  await page.getByRole("button", { name: "Create set" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Questions" })).toBeVisible();

  // Assign only the new easy question, then attempt to publish → rejected
  const kettle = page.getByLabel("Approved question").locator("option", { hasText: `Example Kettle ${stamp}` });
  await page.getByLabel("Approved question").selectOption((await kettle.getAttribute("value")) ?? "");
  await page.getByRole("button", { name: "Assign" }).click();
  await expect(page.getByText(/E2E sample: what does the fictional Example Kettle/)).toBeVisible();
  await page.getByLabel(/Publish this set/).check();
  await page.getByRole("button", { name: "Publish set" }).click();
  await expect(page.getByText("Set needs exactly 3 questions (has 1)").first()).toBeVisible();

  // Fill medium/hard with approved questions created through the DB workflow functions
  const [{ id: adminId }] = await db()`select id from auth.users where email = ${adminEmail}`;
  for (const [difficulty, amount] of [["medium", "125000"], ["hard", "9500000000"]] as const) {
    const [{ r: saved }] = await db()`
      select pricele.admin_save_question(${adminId}::uuid, null, ${db().json({
        prompt: `E2E sample ${difficulty} ${stamp}: what was the fictional Example deal worth?`,
        context: null,
        imageUrl: "/items/sedan.svg",
        imageAlt: "Illustration used by the end-to-end test",
        difficulty,
        categoryId: (await db()`select id from public.categories where slug = 'business-and-markets'`)[0].id,
        answerAmount: amount,
        answerDefinition: "Fictional test amount",
        referenceDate: "2026-10-01",
        explanation: "Fictional test data used by the end-to-end suite.",
      })}::jsonb) as r`;
    await db()`select pricele.admin_add_source(${adminId}::uuid, ${saved.id}::uuid, ${db().json({
      title: "Fictional record", publisher: "Example (fictional)", url: "https://example.com/deal", supportingExcerpt: "fictional",
    })}::jsonb)`;
    await db()`select pricele.admin_verify_answer(${adminId}::uuid, ${saved.id}::uuid, true)`;
    await db()`select pricele.admin_set_question_status(${adminId}::uuid, ${saved.id}::uuid, 'approve')`;
  }
  await page.reload();
  for (const label of [`medium ${stamp}`, `hard ${stamp}`]) {
    const option = page.getByLabel("Approved question").locator("option", { hasText: label });
    await page.getByLabel("Approved question").selectOption(await option.getAttribute("value") ?? "");
    await page.getByRole("button", { name: "Assign" }).click();
    await expect(page.getByRole("link", { name: new RegExp(label) })).toBeVisible();
  }
  await page.getByLabel(/Publish this set/).check();
  await page.getByRole("button", { name: "Publish set" }).click();
  await expect(page.getByText("Published and scheduled")).toBeVisible();

  // Future set is not visible to players, and its answer is protected
  const html = await (await page.request.get(`/archive/${d}`)).text();
  expect(html).not.toContain("Example Kettle");
  expect(html).not.toContain("49.99");

  // Correction workflow on today's easy question (players have attempts on it)
  const [{ qid, old }] = await db()`
    select d.question_id as qid, qa.answer_amount::text as old from public.daily_sets ds
      join public.daily_set_questions d on d.daily_set_id = ds.id and d.position = 1
      join public.question_answers qa on qa.question_id = d.question_id
     where ds.game_date = pricele.current_game_date()`;
  await page.goto(`/admin/questions/${qid}`);
  await page.getByLabel("Corrected amount (USD)").fill(String(Number(old) * 2));
  await page.getByLabel("Reason (shown to players)").fill("E2E: the fictional listing was updated after publication.");
  await page.getByLabel("Source supporting the correction").fill("https://example.com/corrected");
  await page.getByLabel(/I understand this changes published scores/).check();
  await page.getByRole("button", { name: "Apply correction" }).click();
  await expect(page.getByText(/Correction applied\. \d+ official/)).toBeVisible();
  // Revert so other specs keep their expected answers
  await db()`select pricele.admin_correct_answer(${adminId}::uuid, ${qid}::uuid, ${old}::numeric, 'E2E: revert test correction to the original amount.', 'https://example.com/revert', true)`;

  await page.goto("/admin/audit");
  await expect(page.getByText("question.correct").first()).toBeVisible();
  await expect(page.getByText("daily_set.publish").first()).toBeVisible();
});
