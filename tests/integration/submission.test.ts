import { beforeAll, describe, expect, it } from "vitest";
import { addDays, createGuestSession, createLiveSet, createUser, makeAdmin, rpc, service, today } from "../support/db";

type Submit = {
  ok: boolean;
  error?: string;
  already_submitted?: boolean;
  set_complete?: boolean | null;
  attempt?: { score: number; guess_amount: string; answer_amount: string; absolute_percentage_error: string; position: number };
};

let admin: { id: string };
let set: { setId: string; questionIds: string[] };

beforeAll(async () => {
  admin = await createUser("admin");
  await makeAdmin(admin.id);
  set = await createLiveSet(admin.id, today(), ["100.00", "25000.00", "4000000000.00"]);
});

describe("official submission", () => {
  it("scores on the server and stores the answer snapshot", async () => {
    const user = await createUser();
    const res = await rpc<Submit>("submit_official_guess", {
      p_question_id: set.questionIds[1],
      p_guess: "30000",
      p_user_id: user.id,
    });
    expect(res.ok).toBe(true);
    expect(res.already_submitted).toBe(false);
    expect(res.attempt!.score).toBe(846);
    expect(res.attempt!.answer_amount).toBe("25000.00");
    expect(res.attempt!.guess_amount).toBe("30000.00");
    expect(res.attempt!.absolute_percentage_error).toBe("20.000000");

    const { data } = await service
      .from("official_attempts")
      .select("answer_snapshot, scoring_version, score")
      .eq("user_id", user.id)
      .single();
    expect(String(data!.answer_snapshot)).toBe("25000");
    expect(data!.scoring_version).toBe("log-ratio-v1");
  });

  it("accepts decimal strings exactly (no float conversion)", async () => {
    const user = await createUser();
    const res = await rpc<Submit>("submit_official_guess", {
      p_question_id: set.questionIds[0],
      p_guess: "999999999999999.99",
      p_user_id: user.id,
    });
    expect(res.ok).toBe(true);
    expect(res.attempt!.guess_amount).toBe("999999999999999.99");
  });

  it("is idempotent: a retry returns the original result without a second attempt", async () => {
    const user = await createUser();
    const first = await rpc<Submit>("submit_official_guess", { p_question_id: set.questionIds[0], p_guess: "50", p_user_id: user.id });
    const retry = await rpc<Submit>("submit_official_guess", { p_question_id: set.questionIds[0], p_guess: "100", p_user_id: user.id });
    expect(first.attempt!.score).toBe(591);
    expect(retry.already_submitted).toBe(true);
    expect(retry.attempt!.score).toBe(591);
    expect(retry.attempt!.guess_amount).toBe("50.00");
    const { count } = await service.from("official_attempts").select("*", { count: "exact", head: true }).eq("user_id", user.id);
    expect(count).toBe(1);
  });

  it("concurrent identical requests create exactly one attempt", async () => {
    const user = await createUser();
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        rpc<Submit>("submit_official_guess", { p_question_id: set.questionIds[2], p_guess: String(1000 + i), p_user_id: user.id }),
      ),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.filter((r) => r.already_submitted === false)).toHaveLength(1);
    const { count } = await service.from("official_attempts").select("*", { count: "exact", head: true }).eq("user_id", user.id);
    expect(count).toBe(1);
  });

  it("concurrent final submissions still produce a completed daily result", async () => {
    const user = await createUser();
    await rpc("submit_official_guess", { p_question_id: set.questionIds[0], p_guess: "100", p_user_id: user.id });
    await Promise.all([
      rpc("submit_official_guess", { p_question_id: set.questionIds[1], p_guess: "25000", p_user_id: user.id }),
      rpc("submit_official_guess", { p_question_id: set.questionIds[2], p_guess: "4000000000", p_user_id: user.id }),
    ]);
    const { data } = await service.from("daily_results").select("*").eq("user_id", user.id).single();
    expect(data!.total_score).toBe(3000);
    expect(data!.perfect_guess_count).toBe(3);
  });

  it("creates the daily result only when all three questions are answered", async () => {
    const user = await createUser();
    const r1 = await rpc<Submit>("submit_official_guess", { p_question_id: set.questionIds[0], p_guess: "200", p_user_id: user.id });
    expect(r1.set_complete).toBe(false);
    let { data } = await service.from("daily_results").select("*").eq("user_id", user.id);
    expect(data).toHaveLength(0);
    await rpc("submit_official_guess", { p_question_id: set.questionIds[1], p_guess: "2500", p_user_id: user.id });
    const r3 = await rpc<Submit>("submit_official_guess", { p_question_id: set.questionIds[2], p_guess: "40000000000", p_user_id: user.id });
    expect(r3.set_complete).toBe(true);
    ({ data } = await service.from("daily_results").select("*").eq("user_id", user.id));
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({ easy_score: 591, medium_score: 303, hard_score: 303, total_score: 1197, perfect_guess_count: 0 });
  });

  it("rejects invalid guesses", async () => {
    const user = await createUser();
    for (const g of ["0", "-5", "0.001", "1000000000000000.01", "NaN"]) {
      const res = await rpc<Submit>("submit_official_guess", { p_question_id: set.questionIds[0], p_guess: g, p_user_id: user.id });
      expect(res, g).toMatchObject({ ok: false, error: "invalid_guess" });
    }
  });

  it("rejects questions that are not part of today's set", async () => {
    const user = await createUser();
    const past = await createLiveSet(admin.id, addDays(today(), -40));
    const res = await rpc<Submit>("submit_official_guess", { p_question_id: past.questionIds[0], p_guess: "10", p_user_id: user.id });
    expect(res).toMatchObject({ ok: false, error: "question_not_current" });

    const unknown = await rpc<Submit>("submit_official_guess", {
      p_question_id: "00000000-0000-0000-0000-000000000000", p_guess: "10", p_user_id: user.id,
    });
    expect(unknown).toMatchObject({ ok: false, error: "question_not_found" });
  });

  it("requires exactly one identity", async () => {
    const user = await createUser();
    const guest = await createGuestSession();
    const both = await rpc<Submit>("submit_official_guess", { p_question_id: set.questionIds[0], p_guess: "10", p_user_id: user.id, p_guest_session_id: guest });
    expect(both).toMatchObject({ ok: false, error: "invalid_identity" });
    const none = await rpc<Submit>("submit_official_guess", { p_question_id: set.questionIds[0], p_guess: "10" });
    expect(none).toMatchObject({ ok: false, error: "invalid_identity" });
  });

  it("rejects expired or revoked guest sessions", async () => {
    const guest = await createGuestSession();
    await service.from("guest_sessions").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", guest);
    const res = await rpc<Submit>("submit_official_guess", { p_question_id: set.questionIds[0], p_guess: "10", p_guest_session_id: guest });
    expect(res).toMatchObject({ ok: false, error: "guest_session_invalid" });
  });

  it("blocks suspended accounts", async () => {
    const user = await createUser();
    await service.from("profiles").update({ suspended_at: new Date().toISOString() }).eq("id", user.id);
    const res = await rpc<Submit>("submit_official_guess", { p_question_id: set.questionIds[0], p_guess: "10", p_user_id: user.id });
    expect(res).toMatchObject({ ok: false, error: "account_suspended" });
  });

  it("does not create daily results for guests", async () => {
    const guest = await createGuestSession();
    for (const [i, q] of set.questionIds.entries()) {
      const res = await rpc<Submit>("submit_official_guess", { p_question_id: q, p_guess: ["10", "10", "10"][i], p_guest_session_id: guest });
      expect(res.ok).toBe(true);
    }
    const { count } = await service.from("official_attempts").select("*", { count: "exact", head: true }).eq("guest_session_id", guest);
    expect(count).toBe(3);
  });
});
