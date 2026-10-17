import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../db/harness";
import {
  categoryId,
  createAdmin,
  createApprovedQuestion,
  createUser,
  guestToken,
  noonEt,
  playSet,
  publishSet,
} from "../db/fixtures";

let db: TestDb;
let adminId: string;
let admin: typeof import("@/lib/admin/service").admin;
let svc: typeof import("@/lib/game/service");

beforeAll(async () => {
  db = await createTestDb();
  process.env.DATABASE_URL = db.appUrl;
  ({ admin } = await import("@/lib/admin/service"));
  svc = await import("@/lib/game/service");
  adminId = await createAdmin(db);
  await db.setNow(noonEt("2026-10-16"));
});

afterAll(async () => {
  await db?.drop();
});

const baseQuestion = async (difficulty: "easy" | "medium" | "hard" = "easy") => ({
  prompt: `What did the reference widget cost at launch, in US dollars? (${Math.random().toString(36).slice(2, 8)})`,
  context: "Use the manufacturer's suggested retail price at launch.",
  difficulty,
  categoryId: await categoryId(db),
  imageUrl: "/items/phone.svg",
  imageAlt: "Illustration used by automated tests",
  imageCredit: null,
  answerAmount: "499.00",
  answerDefinition: "Manufacturer's suggested retail price at launch",
  referenceDate: "2026-09-01",
  referencePeriod: null,
  explanation: "The manufacturer announced the launch price in its press release.",
});

describe("authorization", () => {
  it("rejects every admin operation for non-admin users", async () => {
    const user = await createUser(db);
    const q = await baseQuestion();
    const calls: (() => Promise<unknown>)[] = [
      () => admin.overview(user),
      () => admin.listQuestions(user, {}),
      () => admin.saveQuestion(user, null, q),
      () => admin.verifyAnswer(user, "00000000-0000-0000-0000-000000000000", true),
      () => admin.createDailySet(user, "2026-11-01"),
      () => admin.publishDailySet(user, "00000000-0000-0000-0000-000000000000", true),
      () => admin.correctAnswer(user, "00000000-0000-0000-0000-000000000000", "5", "reason long enough", "https://x.test", true),
      () => admin.searchUsers(user, ""),
      () => admin.setSuspension(user, adminId, true, "nope nope"),
      () => admin.auditLog(user),
    ];
    for (const c of calls) await expect(c()).rejects.toThrow(/PRICELE_FORBIDDEN/);
  });

  it("does not let the server role grant admin or read tables directly", async () => {
    const postgres = (await import("postgres")).default;
    const app = postgres(db.appUrl, { max: 1, onnotice: () => {} });
    try {
      await expect(app`select pricele.bootstrap_admin('x@example.test', true)`).rejects.toThrow(/permission denied/);
      await expect(app`select * from public.question_answers`).rejects.toThrow(/permission denied/);
      await expect(app`insert into public.user_roles (user_id, role) values (gen_random_uuid(), 'admin')`).rejects.toThrow(
        /permission denied/,
      );
      await expect(app`update public.official_attempts set score = 1000`).rejects.toThrow(/permission denied/);
    } finally {
      await app.end();
    }
  });

  it("refuses to bootstrap a second admin unless explicitly allowed", async () => {
    const id = await createUser(db, "wannabe");
    const [{ email }] = await db.owner`select email from auth.users where id = ${id}`;
    const [row] = await db.owner`select pricele.bootstrap_admin(${email}) as r`;
    expect(row.r).toEqual({ ok: false, error: "admin_already_exists" });
  });
});

describe("question workflow", () => {
  it("requires sources and a supporting note before verification, and verification before approval", async () => {
    const saved = await admin.saveQuestion(adminId, null, await baseQuestion());
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(await admin.setQuestionStatus(adminId, saved.id, "approve")).toEqual({ ok: false, error: "not_verified" });
    const v1 = await admin.verifyAnswer(adminId, saved.id, true);
    expect(v1.ok).toBe(false);
    if (!v1.ok) expect(v1.problems).toContain("At least one source is required");
    expect(await admin.verifyAnswer(adminId, saved.id, false)).toEqual({ ok: false, error: "attestation_required" });

    await admin.addSource(adminId, saved.id, {
      title: "Launch press release",
      publisher: "Widget Co.",
      url: "https://widget.example/press",
      publishedAt: "2026-09-01",
      referenceDate: null,
      supportingExcerpt: null,
      verificationNotes: null,
    });
    const v2 = await admin.verifyAnswer(adminId, saved.id, true);
    expect(v2.ok).toBe(false);
    if (!v2.ok) expect(v2.problems?.[0]).toMatch(/supporting excerpt/);

    const q = await admin.getQuestion(adminId, saved.id);
    await admin.deleteSource(adminId, q!.sources[0].id);
    await admin.addSource(adminId, saved.id, {
      title: "Launch press release",
      publisher: "Widget Co.",
      url: "https://widget.example/press",
      publishedAt: "2026-09-01",
      referenceDate: null,
      supportingExcerpt: "Widget will be available for $499.",
      verificationNotes: null,
    });
    expect(await admin.verifyAnswer(adminId, saved.id, true)).toEqual({ ok: true });
    expect(await admin.setQuestionStatus(adminId, saved.id, "approve")).toEqual({ ok: true });

    // Editing an approved question sends it back to draft and clears verification.
    const edited = await admin.saveQuestion(adminId, saved.id, { ...(await baseQuestion()), answerAmount: "549.00" });
    expect(edited.ok).toBe(true);
    const after = await admin.getQuestion(adminId, saved.id);
    expect(after?.status).toBe("draft");
    expect(after?.answer?.verificationStatus).toBe("unverified");
  });

  it("requires a picture of the item before verification", async () => {
    const saved = await admin.saveQuestion(adminId, null, { ...(await baseQuestion()), imageUrl: null, imageAlt: null });
    if (!saved.ok) throw new Error("save failed");
    await admin.addSource(adminId, saved.id, {
      title: "Launch press release",
      publisher: "Widget Co.",
      url: "https://widget.example/press",
      publishedAt: null,
      referenceDate: null,
      supportingExcerpt: "Widget will be available for $499.",
      verificationNotes: null,
    });
    const v = await admin.verifyAnswer(adminId, saved.id, true);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.problems).toEqual(["Add a picture of the item"]);
    // Only https links or pictures bundled under /items/ are accepted.
    for (const bad of ["http://example.com/a.jpg", "/etc/passwd", "javascript:alert(1)"]) {
      const r = await admin.saveQuestion(adminId, saved.id, { ...(await baseQuestion()), imageUrl: bad });
      expect(r.ok, bad).toBe(false);
    }
  });

  it("rejects invalid answer amounts", async () => {
    for (const amount of ["0", "-1", "abc", "1.234", "1000000000000001"]) {
      const r = await admin.saveQuestion(adminId, null, { ...(await baseQuestion()), answerAmount: amount });
      expect(r.ok).toBe(false);
    }
  });

  it("flags likely duplicates", async () => {
    const q = await baseQuestion();
    const a = await admin.saveQuestion(adminId, null, { ...q, prompt: "How much did the Example Tower renovation cost in total?" });
    const similar = await admin.similarQuestions(adminId, null, "How much did the Example Tower renovation cost?");
    expect(a.ok).toBe(true);
    expect(similar.some((s) => a.ok && s.id === a.id)).toBe(true);
  });
});

describe("daily set publication", () => {
  it("rejects invalid sets with specific reasons", async () => {
    const date = "2026-11-02";
    const created = await admin.createDailySet(adminId, date);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect((await admin.publishDailySet(adminId, created.id, false))).toEqual({ ok: false, error: "confirmation_required" });
    const empty = await admin.publishDailySet(adminId, created.id, true);
    expect(empty.ok).toBe(false);
    expect(empty.validation?.errors).toContain("Set needs exactly 3 questions (has 0)");

    // Draft (unverified) questions can't even be assigned.
    const draft = await admin.saveQuestion(adminId, null, await baseQuestion("easy"));
    if (!draft.ok) throw new Error("save failed");
    expect(await admin.assignQuestion(adminId, created.id, draft.id)).toEqual({ ok: false, error: "question_not_approved" });

    // Wrong position is impossible: the trigger enforces difficulty ↔ position.
    const hard = await createApprovedQuestion(db, adminId, "hard", "1000000");
    await expect(
      db.owner`insert into public.daily_set_questions (daily_set_id, question_id, position) values (${created.id}, ${hard}, 1)`,
    ).rejects.toThrow(/does not match difficulty/);

    const easy = await createApprovedQuestion(db, adminId, "easy", "10");
    const medium = await createApprovedQuestion(db, adminId, "medium", "1000");
    for (const id of [easy, medium, hard]) expect((await admin.assignQuestion(adminId, created.id, id)).ok).toBe(true);
    // Reusing a question in another set is refused.
    const other = await admin.createDailySet(adminId, "2026-11-03");
    if (!other.ok) throw new Error("create failed");
    expect(await admin.assignQuestion(adminId, other.id, easy)).toEqual({ ok: false, error: "question_already_used" });

    const pub = await admin.publishDailySet(adminId, created.id, true);
    expect(pub).toEqual({ ok: true, status: "scheduled" });
    expect(await admin.createDailySet(adminId, date)).toEqual({ ok: false, error: "date_taken" });
    // Membership is frozen after publication.
    expect(await admin.unassignQuestion(adminId, created.id, 1)).toEqual({ ok: false, error: "set_locked" });
    await expect(db.owner`delete from public.daily_set_questions where daily_set_id = ${created.id}`).rejects.toThrow(/PRICELE_IMMUTABLE/);

    // Past dates are refused.
    expect(await admin.createDailySet(adminId, "2026-10-01")).toEqual({ ok: false, error: "date_in_past" });

    // Scheduled → live when the date arrives (cron promotes the status; reads don't depend on it).
    await db.setNow(noonEt(date));
    const state = await svc.getGameState();
    expect(state.available && state.setId).toBe(created.id);
    const { cronPublicationCheck } = await import("@/lib/admin/service");
    const cron = await cronPublicationCheck();
    expect(cron.promoted).toBeGreaterThanOrEqual(1);
    expect(cron.todayLive).toBe(true);
    await db.setNow(noonEt("2026-10-16"));
  });

  it("allows withdrawal only before anyone has played", async () => {
    const { setId, questionIds } = await publishSet(db, adminId, "2026-10-20", undefined, { nowAfter: noonEt("2026-10-16") });
    expect(await admin.unpublishDailySet(adminId, setId, "")).toEqual({ ok: false, error: "reason_required" });
    expect(await admin.unpublishDailySet(adminId, setId, "Found a typo in the hard question")).toEqual({ ok: true });
    const set = await admin.getDailySet(adminId, setId);
    expect(set?.status).toBe("draft");
    expect((await admin.publishDailySet(adminId, setId, true)).ok).toBe(true);

    await db.setNow(noonEt("2026-10-20"));
    const g = guestToken();
    await svc.createGuestSession(g.hash, 30);
    await playSet(null, g.hash, questionIds.slice(0, 1), ["5"]);
    expect(await admin.unpublishDailySet(adminId, setId, "Too late to withdraw now")).toEqual({
      ok: false,
      error: "already_played",
    });
    await db.setNow(noonEt("2026-10-16"));
  });

  it("protects published questions and answers from ordinary edits", async () => {
    const { questionIds } = await publishSet(db, adminId, "2026-10-21", undefined, { nowAfter: noonEt("2026-10-16") });
    expect(await admin.saveQuestion(adminId, questionIds[0], await baseQuestion())).toEqual({ ok: false, error: "not_editable" });
    await expect(db.owner`update public.questions set prompt = 'Changed prompt text here' where id = ${questionIds[0]}`).rejects.toThrow(
      /PRICELE_IMMUTABLE/,
    );
    await expect(db.owner`update public.question_answers set answer_amount = 1 where question_id = ${questionIds[0]}`).rejects.toThrow(
      /PRICELE_IMMUTABLE/,
    );
    await expect(db.owner`delete from public.questions where id = ${questionIds[0]}`).rejects.toThrow(/PRICELE_IMMUTABLE/);
    await expect(db.owner`delete from public.daily_sets where game_date = '2026-10-21'`).rejects.toThrow(/PRICELE_IMMUTABLE/);
  });
});

describe("corrections", () => {
  it("re-scores every affected attempt, keeps a revision trail, and updates results and rankings", async () => {
    const date = "2026-10-22";
    const { questionIds } = await publishSet(db, adminId, date, ["100.00", "25000.00", "4000000000.00"]);
    const u1 = await createUser(db, "corr_one");
    const u2 = await createUser(db, "corr_two");
    await playSet(u1, null, questionIds, ["100", "25000", "2000000000"]); // hard 591 → after fix exact
    await playSet(u2, null, questionIds, ["100", "25000", "4000000000"]); // hard 1000 → after fix 591
    let board = await svc.getDailyLeaderboard(date);
    expect(board.map((r) => r.username)).toEqual(["corr_two", "corr_one"]);

    expect(await admin.correctAnswer(adminId, questionIds[2], "2000000000", "short", "https://x.test", true)).toEqual({
      ok: false,
      error: "reason_required",
    });
    const res = await admin.correctAnswer(
      adminId,
      questionIds[2],
      "2000000000",
      "The filing reports the equity value, not enterprise value.",
      "https://filings.example/8k",
      true,
    );
    expect(res).toMatchObject({ ok: true, affectedOfficial: 2 });

    board = await svc.getDailyLeaderboard(date);
    expect(board.map((r) => [r.username, r.totalScore, r.hardScore])).toEqual([
      ["corr_one", 3000, 1000],
      ["corr_two", 2591, 591],
    ]);
    const revisions = await db.owner`
      select old_score, new_score, old_answer_snapshot::text as old_a from public.official_attempt_revisions r
        join public.official_attempts a on a.id = r.attempt_id order by old_score`;
    expect(revisions.map((r) => [r.old_score, r.new_score, r.old_a])).toEqual([
      [591, 1000, "4000000000.00"],
      [1000, 591, "4000000000.00"],
    ]);
    // Players see a transparent correction notice in the reveal.
    const state = await svc.getGameState({ userId: u1, guestHash: null });
    if (!state.available) throw new Error("unavailable");
    expect(state.questions[2].attempt?.reveal.corrections[0]).toMatchObject({
      oldAnswer: "4000000000.00",
      newAnswer: "2000000000.00",
    });
    const audit = await admin.auditLog(adminId, 5);
    expect(audit[0].action).toBe("question.correct");
  });
});
