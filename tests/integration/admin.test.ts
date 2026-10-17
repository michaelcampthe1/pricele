import { beforeAll, describe, expect, it } from "vitest";
import { createLiveSet, createUser, makeAdmin, rpc, service, sql, today, uniqueFutureDate } from "../support/db";

type Res = { ok: boolean; error?: string; issues?: string[]; [k: string]: unknown };

let admin: { id: string };
let categoryId: string;

beforeAll(async () => {
  admin = await createUser("admin");
  await makeAdmin(admin.id);
  categoryId = (await service.from("categories").select("id").eq("slug", "technology").single()).data!.id;
});

const payload = (difficulty: string, extra: Record<string, unknown> = {}) => ({
  prompt: `TEST How much did the reference item cost? ${Math.random()}`,
  context: "Use the list price on the reference date.",
  difficulty,
  category_id: categoryId,
  answer_amount: "1299.00",
  answer_definition: "Manufacturer list price",
  reference_date: "2026-01-15",
  explanation: "Fixture explanation.",
  ...extra,
});

async function readyQuestion(difficulty: string) {
  const created = await rpc<Res & { question_id: string }>("admin_save_question", { p_admin_id: admin.id, p_question_id: null, p_payload: payload(difficulty) });
  await service.from("question_sources").insert({ question_id: created.question_id, title: "Fixture", publisher: "Tests", source_url: "https://example.com/s" });
  expect((await rpc<Res>("admin_verify_question", { p_admin_id: admin.id, p_question_id: created.question_id, p_notes: "checked" })).ok).toBe(true);
  expect((await rpc<Res>("admin_set_question_status", { p_admin_id: admin.id, p_question_id: created.question_id, p_status: "approved" })).ok).toBe(true);
  return created.question_id;
}

describe("question workflow", () => {
  it("requires a source and complete answer data before verification", async () => {
    const { question_id } = await rpc<Res & { question_id: string }>("admin_save_question", {
      p_admin_id: admin.id, p_question_id: null, p_payload: payload("easy", { answer_amount: "", explanation: "" }),
    });
    const verify = await rpc<Res>("admin_verify_question", { p_admin_id: admin.id, p_question_id: question_id, p_notes: "" });
    expect(verify.ok).toBe(false);
    expect(verify.issues).toEqual(expect.arrayContaining(["answer_missing", "explanation_missing", "source_missing"]));
    const approve = await rpc<Res>("admin_set_question_status", { p_admin_id: admin.id, p_question_id: question_id, p_status: "approved" });
    expect(approve).toMatchObject({ ok: false, error: "question_unverified" });
  });

  it("rejects zero, negative and sub-cent answers", async () => {
    for (const amount of ["0", "-1", "1.005"]) {
      const res = await rpc<Res>("admin_save_question", { p_admin_id: admin.id, p_question_id: null, p_payload: payload("easy", { answer_amount: amount }) });
      expect(res, amount).toMatchObject({ ok: false, error: "invalid_answer" });
    }
  });

  it("editing a verified answer resets verification and returns approved questions to draft", async () => {
    const id = await readyQuestion("medium");
    const res = await rpc<Res>("admin_save_question", { p_admin_id: admin.id, p_question_id: id, p_payload: payload("medium", { answer_amount: "1399.00" }) });
    expect(res).toMatchObject({ ok: true, verification_reset: true });
    const { data } = await service.from("questions").select("status, question_answers(verification_status)").eq("id", id).single();
    expect(data!.status).toBe("draft");
    expect((data!.question_answers as unknown as { verification_status: string }).verification_status).toBe("unverified");
  });

  it("writes an audit trail", async () => {
    const id = await readyQuestion("hard");
    const { data } = await service.from("admin_audit_log").select("action").eq("entity_id", id).order("created_at");
    expect(data!.map((r) => r.action)).toEqual(["question.create", "question.verify", "question.status"]);
  });

  it("flags likely duplicates", async () => {
    const prompt = "TEST What did the Zebra Corp pay to acquire Quokka Labs in its announced deal?";
    await rpc("admin_save_question", { p_admin_id: admin.id, p_question_id: null, p_payload: payload("hard", { prompt }) });
    const { data } = await service.rpc("admin_similar_questions", { p_prompt: "What did Zebra Corp pay to acquire Quokka Labs in the announced deal" });
    expect(data!.length).toBeGreaterThan(0);
  });
});

describe("daily set publication", () => {
  it("refuses invalid sets and publishes valid ones with explicit confirmation", async () => {
    const date = uniqueFutureDate();
    const { data: set } = await service.from("daily_sets").insert({ game_date: date, created_by: admin.id }).select("id").single();
    const easy = await readyQuestion("easy");
    const medium = await readyQuestion("medium");

    // wrong difficulty for the position
    expect(await rpc<Res>("admin_assign_set_question", { p_admin_id: admin.id, p_daily_set_id: set!.id, p_position: 1, p_question_id: medium }))
      .toMatchObject({ ok: false, error: "difficulty_mismatch" });
    // unapproved question
    const { question_id: draft } = await rpc<Res & { question_id: string }>("admin_save_question", { p_admin_id: admin.id, p_question_id: null, p_payload: payload("hard") });
    expect(await rpc<Res>("admin_assign_set_question", { p_admin_id: admin.id, p_daily_set_id: set!.id, p_position: 3, p_question_id: draft }))
      .toMatchObject({ ok: false, error: "question_not_approved" });

    await rpc("admin_assign_set_question", { p_admin_id: admin.id, p_daily_set_id: set!.id, p_position: 1, p_question_id: easy });
    await rpc("admin_assign_set_question", { p_admin_id: admin.id, p_daily_set_id: set!.id, p_position: 2, p_question_id: medium });

    const incomplete = await rpc<Res>("admin_publish_daily_set", { p_admin_id: admin.id, p_daily_set_id: set!.id, p_confirm_date: date });
    expect(incomplete).toMatchObject({ ok: false, error: "set_invalid" });
    expect(incomplete.issues).toContain("requires_three_questions");

    const hard = await readyQuestion("hard");
    await rpc("admin_assign_set_question", { p_admin_id: admin.id, p_daily_set_id: set!.id, p_position: 3, p_question_id: hard });

    // a question that loses verification after assignment blocks publication
    await sql("update public.question_answers set verification_status = 'unverified' where question_id = $1", [hard]);
    const unverified = await rpc<Res>("admin_publish_daily_set", { p_admin_id: admin.id, p_daily_set_id: set!.id, p_confirm_date: date });
    expect(unverified.issues).toContain("position_3_unverified");
    await sql("update public.question_answers set verification_status = 'verified' where question_id = $1", [hard]);

    expect(await rpc<Res>("admin_publish_daily_set", { p_admin_id: admin.id, p_daily_set_id: set!.id, p_confirm_date: "2000-01-01" }))
      .toMatchObject({ ok: false, error: "confirmation_mismatch" });

    const published = await rpc<Res>("admin_publish_daily_set", { p_admin_id: admin.id, p_daily_set_id: set!.id, p_confirm_date: date });
    expect(published).toMatchObject({ ok: true, status: "scheduled" });

    // locked now
    expect(await rpc<Res>("admin_save_question", { p_admin_id: admin.id, p_question_id: easy, p_payload: payload("easy") }))
      .toMatchObject({ ok: false, error: "question_locked" });
    expect(await rpc<Res>("admin_assign_set_question", { p_admin_id: admin.id, p_daily_set_id: set!.id, p_position: 1, p_question_id: null }))
      .toMatchObject({ ok: false, error: "set_locked" });

    // a scheduled future set can be returned to draft
    expect((await rpc<Res>("admin_unschedule_daily_set", { p_admin_id: admin.id, p_daily_set_id: set!.id })).ok).toBe(true);
  });

  it("prevents a second set on the same date", async () => {
    const date = uniqueFutureDate();
    await service.from("daily_sets").insert({ game_date: date });
    const dup = await service.from("daily_sets").insert({ game_date: date });
    expect(dup.error).not.toBeNull();
  });

  it("refuses to publish for a past date", async () => {
    const past = `2001-${String(1 + Math.floor(Math.random() * 12)).padStart(2, "0")}-${String(1 + Math.floor(Math.random() * 28)).padStart(2, "0")}`;
    await service.from("daily_sets").delete().eq("game_date", past).eq("status", "draft");
    const { data: set } = await service.from("daily_sets").insert({ game_date: past }).select("id").single();
    const issues = await rpc<string[]>("validate_daily_set", { p_daily_set_id: set!.id });
    expect(issues).toContain("date_in_past");
  });

  it("daily maintenance promotes due scheduled sets and reports upcoming coverage", async () => {
    const res = await rpc<{ game_date: string; upcoming: unknown[] }>("run_daily_maintenance", {});
    expect(res.game_date).toBe(today());
    expect(res.upcoming).toHaveLength(7);
  });
});

describe("corrections", () => {
  it("rescoring after an answer correction updates every attempt and result, with an audit trail", async () => {
    const live = await createLiveSet(admin.id, today(), ["100.00", "25000.00", "4000000000.00"]);
    const player = await createUser();
    for (const [i, q] of live.questionIds.entries()) {
      await rpc("submit_official_guess", { p_question_id: q, p_guess: ["200", "25000", "4000000000"][i], p_user_id: player.id });
    }
    const before = (await service.from("daily_results").select("total_score").eq("user_id", player.id).single()).data!;
    expect(before.total_score).toBe(2591);

    const res = await rpc<Res>("admin_correct_answer", {
      p_admin_id: admin.id, p_question_id: live.questionIds[0], p_new_answer: "200.00",
      p_reason: "Source listed the sale price, not list price.", p_source_url: "https://example.com/corrected",
      p_public_note: "Corrected to the list price.",
    });
    expect(res.ok).toBe(true);
    expect(res.affected_attempts).toBeGreaterThanOrEqual(1);

    const { data: attempt } = await service.from("official_attempts")
      .select("score, original_score, answer_snapshot::text, original_answer_snapshot::text")
      .eq("user_id", player.id).eq("question_id", live.questionIds[0]).single();
    expect(attempt).toMatchObject({ score: 1000, original_score: 591, answer_snapshot: "200.00", original_answer_snapshot: "100.00" });
    const after = (await service.from("daily_results").select("total_score, perfect_guess_count").eq("user_id", player.id).single()).data!;
    expect(after).toMatchObject({ total_score: 3000, perfect_guess_count: 3 });

    const { data: corr } = await service.from("question_corrections").select("old_answer::text, new_answer::text, kind").eq("question_id", live.questionIds[0]).single();
    expect(corr).toMatchObject({ old_answer: "100.00", new_answer: "200.00", kind: "answer_correction" });
    const { data: q } = await service.from("questions").select("correction_note").eq("id", live.questionIds[0]).single();
    expect(q!.correction_note).toBe("Corrected to the list price.");
  });

  it("withdrawing a question voids it for everyone and completes games on the remaining questions", async () => {
    const live = await createLiveSet(admin.id, today());
    const finished = await createUser();
    const partial = await createUser();
    for (const [i, q] of live.questionIds.entries()) {
      await rpc("submit_official_guess", { p_question_id: q, p_guess: ["100", "25000", "1"][i], p_user_id: finished.id });
    }
    await rpc("submit_official_guess", { p_question_id: live.questionIds[0], p_guess: "100", p_user_id: partial.id });
    await rpc("submit_official_guess", { p_question_id: live.questionIds[1], p_guess: "25000", p_user_id: partial.id });

    const res = await rpc<Res>("admin_withdraw_question", { p_admin_id: admin.id, p_question_id: live.questionIds[2], p_reason: "Ambiguous definition", p_public_note: "Withdrawn: ambiguous." });
    expect(res.ok).toBe(true);

    const { data } = await service.from("daily_results").select("user_id, total_score, hard_score").in("user_id", [finished.id, partial.id]);
    expect(data).toHaveLength(2);
    expect(data!.every((r) => r.total_score === 2000 && r.hard_score === 0)).toBe(true);
    const late = await rpc<Res>("submit_official_guess", { p_question_id: live.questionIds[2], p_guess: "1", p_user_id: partial.id });
    expect(late).toMatchObject({ ok: false, error: "question_withdrawn" });
  });

  it("corrections require a reason and a source", async () => {
    const live = await createLiveSet(admin.id, today());
    expect(await rpc<Res>("admin_correct_answer", { p_admin_id: admin.id, p_question_id: live.questionIds[0], p_new_answer: "5", p_reason: "", p_source_url: "https://x.example", p_public_note: "" }))
      .toMatchObject({ ok: false, error: "reason_required" });
    expect(await rpc<Res>("admin_correct_answer", { p_admin_id: admin.id, p_question_id: live.questionIds[0], p_new_answer: "5", p_reason: "valid reason", p_source_url: "", p_public_note: "" }))
      .toMatchObject({ ok: false, error: "source_required" });
  });
});
