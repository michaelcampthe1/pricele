import { createHash, randomBytes } from "node:crypto";
import type { TestDb } from "./harness";
import { gameDayStartUtc } from "@/lib/dates";

export function noonEt(gameDate: string): string {
  // 12:00 ET on the given game date (midnight ET + 12h; DST transitions happen at 2 AM).
  return new Date(gameDayStartUtc(gameDate).getTime() + 12 * 3600 * 1000).toISOString();
}

export function guestToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: createHash("sha256").update(token).digest() };
}

let userCounter = 0;
export async function createUser(db: TestDb, username?: string, email?: string): Promise<string> {
  userCounter += 1;
  const name = username ?? `user${userCounter}_${randomBytes(2).toString("hex")}`;
  const mail = email ?? `${name}@example.test`;
  const [row] = await db.owner`
    insert into auth.users (email, raw_user_meta_data) values (${mail}, ${db.owner.json({ username: name })})
    returning id`;
  return row.id;
}

export async function createAdmin(db: TestDb): Promise<string> {
  const id = await createUser(db, `admin_${randomBytes(2).toString("hex")}`);
  const [{ email }] = await db.owner`select email from auth.users where id = ${id}`;
  const [row] = await db.owner`select pricele.bootstrap_admin(${email}, true) as r`;
  if (!row.r.ok) throw new Error(`bootstrap failed: ${JSON.stringify(row.r)}`);
  return id;
}

export async function categoryId(db: TestDb, slug = "everyday-products"): Promise<string> {
  const [row] = await db.owner`select id from public.categories where slug = ${slug}`;
  return row.id;
}

/** Creates a verified, approved question through the real admin workflow. */
export async function createApprovedQuestion(
  db: TestDb,
  adminId: string,
  difficulty: "easy" | "medium" | "hard",
  answer: string,
  opts: { categorySlug?: string; prompt?: string } = {},
): Promise<string> {
  const { admin } = await import("@/lib/admin/service");
  const saved = await admin.saveQuestion(adminId, null, {
    prompt: opts.prompt ?? `Test question ${difficulty} ${randomBytes(4).toString("hex")} — how much did it cost?`,
    context: "Integration-test fixture.",
    difficulty,
    categoryId: await categoryId(db, opts.categorySlug),
    imageUrl: null,
    imageAlt: null,
    imageCredit: null,
    answerAmount: answer,
    answerDefinition: "Fixture amount for automated tests",
    referenceDate: "2026-01-01",
    referencePeriod: null,
    explanation: "This explanation exists only for automated tests.",
  });
  if (!saved.ok) throw new Error(`save failed: ${JSON.stringify(saved)}`);
  const src = await admin.addSource(adminId, saved.id, {
    title: "Fixture source",
    publisher: "Test Publisher",
    url: "https://example.test/source",
    publishedAt: null,
    referenceDate: null,
    supportingExcerpt: "The fixture costs the fixture amount.",
    verificationNotes: null,
  });
  if (!src.ok) throw new Error(`source failed: ${JSON.stringify(src)}`);
  const v = await admin.verifyAnswer(adminId, saved.id, true);
  if (!v.ok) throw new Error(`verify failed: ${JSON.stringify(v)}`);
  const ap = await admin.setQuestionStatus(adminId, saved.id, "approve");
  if (!ap.ok) throw new Error(`approve failed: ${JSON.stringify(ap)}`);
  return saved.id;
}

/**
 * Publishes a full set for `gameDate`. Temporarily moves the clock to that date (sets can't be
 * created for past dates) and then to `nowAfter` (defaults to noon ET on gameDate).
 */
export async function publishSet(
  db: TestDb,
  adminId: string,
  gameDate: string,
  answers: [string, string, string] = ["100.00", "25000.00", "4000000000.00"],
  opts: { nowAfter?: string; categories?: [string, string, string] } = {},
): Promise<{ setId: string; questionIds: [string, string, string] }> {
  const { admin } = await import("@/lib/admin/service");
  await db.setNow(noonEt(gameDate));
  const cats = opts.categories ?? ["everyday-products", "sports", "technology"];
  const ids = [
    await createApprovedQuestion(db, adminId, "easy", answers[0], { categorySlug: cats[0] }),
    await createApprovedQuestion(db, adminId, "medium", answers[1], { categorySlug: cats[1] }),
    await createApprovedQuestion(db, adminId, "hard", answers[2], { categorySlug: cats[2] }),
  ] as [string, string, string];
  const created = await admin.createDailySet(adminId, gameDate);
  if (!created.ok) throw new Error(`create set failed: ${JSON.stringify(created)}`);
  for (const id of ids) {
    const r = await admin.assignQuestion(adminId, created.id, id);
    if (!r.ok) throw new Error(`assign failed: ${JSON.stringify(r)}`);
  }
  const pub = await admin.publishDailySet(adminId, created.id, true);
  if (!pub.ok) throw new Error(`publish failed: ${JSON.stringify(pub)}`);
  await db.setNow(opts.nowAfter ?? noonEt(gameDate));
  return { setId: created.id, questionIds: ids };
}

export async function playSet(
  userId: string | null,
  guestHash: Buffer | null,
  questionIds: string[],
  guesses: string[],
) {
  const { submitOfficialGuess } = await import("@/lib/game/service");
  const results = [];
  for (let i = 0; i < questionIds.length; i++) {
    results.push(await submitOfficialGuess({ userId, guestHash }, questionIds[i], guesses[i]));
  }
  return results;
}
