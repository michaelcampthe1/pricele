import { beforeAll, describe, expect, it } from "vitest";
import { addDays, createGuestSession, createLiveSet, createUser, makeAdmin, rpc, service, sql, today } from "../support/db";

type Res = { ok: boolean; error?: string; [k: string]: unknown };

let admin: { id: string };
let live: { setId: string; questionIds: string[] };
let past: { setId: string; questionIds: string[] };

beforeAll(async () => {
  admin = await createUser("admin");
  await makeAdmin(admin.id);
  live = await createLiveSet(admin.id, today());
  past = await createLiveSet(admin.id, addDays(today(), -60 - Math.floor(Math.random() * 300)));
});

async function playAsGuest(guest: string, questionIds: string[], guesses = ["100", "25000", "4000000000"]) {
  for (const [i, q] of questionIds.entries()) {
    const r = await rpc<Res>("submit_official_guess", { p_question_id: q, p_guess: guesses[i], p_guest_session_id: guest });
    expect(r.ok).toBe(true);
  }
}

describe("guest claiming", () => {
  it("transfers a completed guest game to the account and creates the daily result", async () => {
    const guest = await createGuestSession();
    await playAsGuest(guest, live.questionIds, ["100", "50000", "4000000000"]);
    const user = await createUser();
    const res = await rpc<Res>("claim_guest_session", { p_guest_session_id: guest, p_user_id: user.id });
    expect(res).toMatchObject({ ok: true, claimed_sets: 1, claimed_attempts: 3, skipped_sets: 0 });

    const { data: result } = await service.from("daily_results").select("*").eq("user_id", user.id).single();
    expect(result).toMatchObject({ easy_score: 1000, medium_score: 591, hard_score: 1000, total_score: 2591, perfect_guess_count: 2 });
    const { data: attempts } = await service.from("official_attempts").select("user_id, guest_session_id, claimed_from_guest_session_id").eq("user_id", user.id);
    expect(attempts).toHaveLength(3);
    expect(attempts!.every((a) => a.guest_session_id === null && a.claimed_from_guest_session_id === guest)).toBe(true);
    const { data: session } = await service.from("guest_sessions").select("claimed_by, claimed_at").eq("id", guest).single();
    expect(session!.claimed_by).toBe(user.id);
  });

  it("cannot claim the same session twice, or after it was claimed by someone else", async () => {
    const guest = await createGuestSession();
    await playAsGuest(guest, live.questionIds);
    const a = await createUser();
    const b = await createUser();
    expect((await rpc<Res>("claim_guest_session", { p_guest_session_id: guest, p_user_id: a.id })).ok).toBe(true);
    expect(await rpc<Res>("claim_guest_session", { p_guest_session_id: guest, p_user_id: a.id })).toMatchObject({ ok: false, error: "guest_session_already_claimed" });
    expect(await rpc<Res>("claim_guest_session", { p_guest_session_id: guest, p_user_id: b.id })).toMatchObject({ ok: false, error: "guest_session_already_claimed" });
    const { count } = await service.from("official_attempts").select("*", { count: "exact", head: true }).eq("user_id", b.id);
    expect(count).toBe(0);
  });

  it("a claimed session can no longer submit", async () => {
    const guest = await createGuestSession();
    await rpc("submit_official_guess", { p_question_id: live.questionIds[0], p_guess: "10", p_guest_session_id: guest });
    const user = await createUser();
    await rpc("claim_guest_session", { p_guest_session_id: guest, p_user_id: user.id });
    const r = await rpc<Res>("submit_official_guess", { p_question_id: live.questionIds[1], p_guess: "10", p_guest_session_id: guest });
    expect(r).toMatchObject({ ok: false, error: "guest_session_invalid" });
  });

  it("skips sets the account already played, so points are never double counted", async () => {
    const user = await createUser();
    await rpc("submit_official_guess", { p_question_id: live.questionIds[0], p_guess: "1", p_user_id: user.id });
    const guest = await createGuestSession();
    await playAsGuest(guest, live.questionIds);
    const res = await rpc<Res>("claim_guest_session", { p_guest_session_id: guest, p_user_id: user.id });
    expect(res).toMatchObject({ ok: true, claimed_sets: 0, skipped_sets: 1 });
    const { count } = await service.from("official_attempts").select("*", { count: "exact", head: true }).eq("user_id", user.id);
    expect(count).toBe(1);
    const { data } = await service.from("daily_results").select("*").eq("user_id", user.id);
    expect(data).toHaveLength(0);
  });

  it("rejects attempts whose submission time does not fall on the set's game date", async () => {
    const guest = await createGuestSession();
    await playAsGuest(guest, live.questionIds);
    await sql("update public.official_attempts set submitted_at = submitted_at - interval '3 days' where guest_session_id = $1 and position = 1", [guest]);
    const user = await createUser();
    const res = await rpc<Res>("claim_guest_session", { p_guest_session_id: guest, p_user_id: user.id });
    expect(res).toMatchObject({ ok: true, claimed_sets: 0, skipped_sets: 1 });
  });

  it("refuses expired or revoked sessions", async () => {
    const guest = await createGuestSession();
    await service.from("guest_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", guest);
    const user = await createUser();
    expect(await rpc<Res>("claim_guest_session", { p_guest_session_id: guest, p_user_id: user.id })).toMatchObject({ ok: false, error: "guest_session_invalid" });
  });
});

describe("practice mode", () => {
  it("scores archive questions without touching official records", async () => {
    const user = await createUser();
    const r = await rpc<Res & { attempt: { score: number } }>("submit_practice_guess", { p_question_id: past.questionIds[0], p_guess: "200", p_user_id: user.id });
    expect(r.ok).toBe(true);
    expect(r.attempt.score).toBe(591);
    const official = await service.from("official_attempts").select("*", { count: "exact", head: true }).eq("user_id", user.id);
    expect(official.count).toBe(0);
    const results = await service.from("daily_results").select("*", { count: "exact", head: true }).eq("user_id", user.id);
    expect(results.count).toBe(0);
    const { data: lb } = await service.rpc("leaderboard_alltime", { p_username: user.username });
    expect(lb).toEqual([]);
  });

  it("allows one practice guess per question (repeat returns the original)", async () => {
    const user = await createUser();
    await rpc("submit_practice_guess", { p_question_id: past.questionIds[1], p_guess: "25000", p_user_id: user.id });
    const again = await rpc<Res & { attempt: { score: number } }>("submit_practice_guess", { p_question_id: past.questionIds[1], p_guess: "1", p_user_id: user.id });
    expect(again.already_submitted).toBe(true);
    expect(again.attempt.score).toBe(1000);
  });

  it("is unavailable for today's questions, and today's questions can't be official from the archive", async () => {
    const user = await createUser();
    expect(await rpc<Res>("submit_practice_guess", { p_question_id: live.questionIds[0], p_guess: "1", p_user_id: user.id }))
      .toMatchObject({ ok: false, error: "practice_not_available" });
    expect(await rpc<Res>("submit_official_guess", { p_question_id: past.questionIds[0], p_guess: "1", p_user_id: user.id }))
      .toMatchObject({ ok: false, error: "question_not_current" });
  });

  it("never replaces an official result", async () => {
    const user = await createUser();
    await sql(
      `insert into public.official_attempts (daily_set_id, question_id, position, user_id, guess_amount, answer_snapshot, score, absolute_percentage_error, scoring_version, submitted_at)
       select $1, $2, 1, $3, 50, 100, 591, 50, 'log-ratio-v1', now() - interval '61 days'`,
      [past.setId, past.questionIds[0], user.id],
    );
    expect(await rpc<Res>("submit_practice_guess", { p_question_id: past.questionIds[0], p_guess: "100", p_user_id: user.id }))
      .toMatchObject({ ok: false, error: "already_played_official" });
  });

  it("works for guests", async () => {
    const guest = await createGuestSession();
    const r = await rpc<Res>("submit_practice_guess", { p_question_id: past.questionIds[2], p_guess: "4000000000", p_guest_session_id: guest });
    expect(r.ok).toBe(true);
  });
});
