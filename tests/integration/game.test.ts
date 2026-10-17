import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../db/harness";
import { createAdmin, createUser, guestToken, noonEt, playSet, publishSet } from "../db/fixtures";
import { computeScore, percentageError } from "@/lib/scoring";

let db: TestDb;
let adminId: string;
let svc: typeof import("@/lib/game/service");

beforeAll(async () => {
  db = await createTestDb();
  process.env.DATABASE_URL = db.appUrl;
  svc = await import("@/lib/game/service");
  adminId = await createAdmin(db);
});

afterAll(async () => {
  await db?.drop();
});

describe("scoring parity (SQL is authoritative, TS mirrors it)", () => {
  it("matches the TypeScript implementation across a wide range of values", async () => {
    const pairs: [string, string][] = [
      ["25000", "25000"],
      ["50000", "25000"],
      ["12500", "25000"],
      ["250000", "25000"],
      ["2500", "25000"],
      ["0.01", "1000000000000000"],
      ["1000000000000000", "0.01"],
      ["20.00", "19.99"],
      ["20.01", "19.99"],
    ];
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 300; i++) {
      const g = (10 ** (rand() * 12 - 1)).toFixed(2);
      const a = (10 ** (rand() * 12 - 1)).toFixed(2);
      if (Number(g) > 0 && Number(a) > 0) pairs.push([g, a]);
    }
    const rows = await db.owner`
      select g, a, pricele.score(g::numeric, a::numeric) as s, pricele.percentage_error(g::numeric, a::numeric)::text as e
        from unnest(${pairs.map((p) => p[0])}::text[], ${pairs.map((p) => p[1])}::text[]) as t(g, a)`;
    for (const r of rows) {
      expect(r.s, `${r.g} vs ${r.a}`).toBe(computeScore(r.g, r.a));
      expect(r.e).toBe(percentageError(r.g, r.a));
    }
  });

  it("rejects non-positive values in SQL", async () => {
    await expect(db.owner`select pricele.score(0, 10)`).rejects.toThrow(/PRICELE_INVALID/);
    await expect(db.owner`select pricele.score(10, -1)`).rejects.toThrow(/PRICELE_INVALID/);
  });
});

describe("daily game", () => {
  let setId: string;
  let qids: [string, string, string];
  const today = "2026-10-16";

  beforeAll(async () => {
    ({ setId, questionIds: qids } = await publishSet(db, adminId, today, ["100.00", "25000.00", "4000000000.00"]));
  });

  it("serves today's set with exactly three ordered questions and no answers", async () => {
    const state = await svc.getGameState();
    expect(state.available).toBe(true);
    if (!state.available) return;
    expect(state.gameDate).toBe(today);
    expect(state.setId).toBe(setId);
    expect(state.questions.map((q) => q.difficulty)).toEqual(["easy", "medium", "hard"]);
    expect(state.questions.map((q) => q.position)).toEqual([1, 2, 3]);
    const json = JSON.stringify(state);
    for (const secret of ["100.00", "25000.00", "4000000000.00", "Fixture amount", "explanation exists"]) {
      expect(json).not.toContain(secret);
    }
    expect(state.questions.every((q) => q.attempt === null)).toBe(true);
  });

  it("scores a guest submission server-side and reveals the answer only afterwards", async () => {
    const g = guestToken();
    await svc.createGuestSession(g.hash, 30);
    const res = await svc.submitOfficialGuess({ userId: null, guestHash: g.hash }, qids[0], "200.00");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.duplicate).toBe(false);
    expect(res.attempt.score).toBe(591);
    expect(res.attempt.guess).toBe("200.00");
    expect(res.attempt.answerSnapshot).toBe("100.00");
    expect(res.attempt.percentageError).toBe("100.000000");
    expect(res.attempt.reveal.answer).toBe("100.00");
    expect(res.attempt.reveal.sources[0].url).toBe("https://example.test/source");
    expect(res.progress).toMatchObject({ answered: 1, total: 591, completed: false });

    const state = await svc.getGameState({ userId: null, guestHash: g.hash });
    if (!state.available) throw new Error("unavailable");
    expect(state.questions[0].attempt?.score).toBe(591);
    // Medium and hard remain hidden.
    expect(JSON.stringify(state.questions.slice(1))).not.toContain("25000.00");
  });

  it("is idempotent: a repeated submission returns the stored result, never a second score", async () => {
    const g = guestToken();
    await svc.createGuestSession(g.hash, 30);
    const first = await svc.submitOfficialGuess({ userId: null, guestHash: g.hash }, qids[1], "25000");
    const second = await svc.submitOfficialGuess({ userId: null, guestHash: g.hash }, qids[1], "1");
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.attempt.score).toBe(1000);
    expect(second.duplicate).toBe(true);
    expect(second.attempt.guess).toBe("25000.00");
    expect(second.attempt.score).toBe(1000);
    const [{ n }] = await db.owner`select count(*)::int as n from public.official_attempts where question_id = ${qids[1]}`;
    expect(n).toBeGreaterThanOrEqual(1);
    const [{ mine }] = await db.owner`
      select count(*)::int as mine from public.official_attempts a
        join public.guest_sessions s on s.id = a.guest_session_id
       where s.token_hash = ${g.hash} and a.question_id = ${qids[1]}`;
    expect(mine).toBe(1);
  });

  it("prevents duplicate official attempts under concurrent requests", async () => {
    const userId = await createUser(db);
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => svc.submitOfficialGuess({ userId, guestHash: null }, qids[2], `${1000 + i}`)),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.filter((r) => r.ok && !r.duplicate)).toHaveLength(1);
    const [{ n }] = await db.owner`
      select count(*)::int as n from public.official_attempts where user_id = ${userId} and question_id = ${qids[2]}`;
    expect(n).toBe(1);
  });

  it("creates exactly one daily result when all three questions are answered concurrently", async () => {
    const userId = await createUser(db);
    await Promise.all([
      svc.submitOfficialGuess({ userId, guestHash: null }, qids[0], "100"),
      svc.submitOfficialGuess({ userId, guestHash: null }, qids[1], "50000"),
      svc.submitOfficialGuess({ userId, guestHash: null }, qids[2], "400000000"),
      svc.submitOfficialGuess({ userId, guestHash: null }, qids[2], "400000000"),
    ]);
    const rows = await db.owner`select * from public.daily_results where user_id = ${userId}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ easy_score: 1000, medium_score: 591, hard_score: 303, total_score: 1894, perfect_guess_count: 1 });
  });

  it("validates guesses on the server", async () => {
    const userId = await createUser(db);
    for (const bad of ["0", "-5", "1000000000000001", "1.234"]) {
      const r = await svc.submitOfficialGuess({ userId, guestHash: null }, qids[0], bad);
      expect(r).toEqual({ ok: false, error: "invalid_guess" });
    }
    // PostgreSQL NUMERIC accepts NaN/Infinity literals; the function must still reject them.
    for (const bad of ["NaN", "Infinity"]) {
      expect(await svc.submitOfficialGuess({ userId, guestHash: null }, qids[0], bad)).toEqual({ ok: false, error: "invalid_guess" });
    }
  });

  it("rejects unknown identities, expired guests, and unknown questions", async () => {
    expect(await svc.submitOfficialGuess({ userId: null, guestHash: null }, qids[0], "5")).toEqual({ ok: false, error: "unauthorized" });
    expect(await svc.submitOfficialGuess({ userId: null, guestHash: guestToken().hash }, qids[0], "5")).toEqual({
      ok: false,
      error: "guest_expired",
    });
    expect(
      await svc.submitOfficialGuess({ userId: "00000000-0000-0000-0000-000000000000", guestHash: null }, qids[0], "5"),
    ).toEqual({ ok: false, error: "unauthorized" });
    const userId = await createUser(db);
    expect(await svc.submitOfficialGuess({ userId, guestHash: null }, "00000000-0000-0000-0000-000000000000", "5")).toEqual({
      ok: false,
      error: "question_not_found",
    });

    const g = guestToken();
    await svc.createGuestSession(g.hash, 30);
    await db.owner`update public.guest_sessions set expires_at = now() - interval '1 minute', created_at = now() - interval '2 minutes' where token_hash = ${g.hash}`;
    expect(await svc.submitOfficialGuess({ userId: null, guestHash: g.hash }, qids[0], "5")).toEqual({
      ok: false,
      error: "guest_expired",
    });
  });

  it("blocks suspended users", async () => {
    const userId = await createUser(db);
    const { admin } = await import("@/lib/admin/service");
    await admin.setSuspension(adminId, userId, true, "Abusive automation");
    expect(await svc.submitOfficialGuess({ userId, guestHash: null }, qids[0], "5")).toEqual({ ok: false, error: "suspended" });
  });

  it("never exposes or accepts a future set, and closes a set when the day ends", async () => {
    const tomorrow = "2026-10-17";
    const { questionIds: future } = await publishSet(db, adminId, tomorrow, undefined, { nowAfter: noonEt(today) });
    const [{ status }] = await db.owner`select status from public.daily_sets where game_date = ${tomorrow}`;
    expect(status).toBe("published"); // published while the clock was on its date (fixture)

    const state = await svc.getGameState(undefined, tomorrow);
    expect(state.available).toBe(false);
    const userId = await createUser(db);
    expect(await svc.submitOfficialGuess({ userId, guestHash: null }, future[0], "5")).toEqual({
      ok: false,
      error: "not_current_set",
    });

    // Next day: yesterday's questions are no longer eligible for official play.
    await db.setNow(noonEt(tomorrow));
    expect(await svc.submitOfficialGuess({ userId, guestHash: null }, qids[0], "5")).toEqual({
      ok: false,
      error: "not_current_set",
    });
    await db.setNow(noonEt(today));
  });

  it("reports an unavailable state when no set is published", async () => {
    await db.setNow(noonEt("2026-12-25"));
    const state = await svc.getGameState();
    expect(state).toMatchObject({ available: false, gameDate: "2026-12-25" });
    await db.setNow(noonEt(today));
  });

  it("uses the America/New_York date across midnight", async () => {
    await db.setNow("2026-10-17T03:59:00Z"); // 11:59 PM EDT Oct 16
    expect((await svc.getGameState()).gameDate).toBe("2026-10-16");
    await db.setNow("2026-10-17T04:00:00Z"); // 12:00 AM EDT Oct 17
    expect((await svc.getGameState()).gameDate).toBe("2026-10-17");
    await db.setNow(noonEt(today));
  });

  it("keeps practice guesses separate and refuses them for today's set", async () => {
    const userId = await createUser(db);
    expect(await svc.submitPracticeGuess({ userId, guestHash: null }, qids[0], "100")).toEqual({
      ok: false,
      error: "not_archived",
    });
    await playSet(userId, null, qids, ["50", "25000", "4000000000"]);
    await db.setNow(noonEt("2026-10-18"));
    // Official exists → practice refused, official preserved.
    expect(await svc.submitPracticeGuess({ userId, guestHash: null }, qids[0], "100")).toEqual({
      ok: false,
      error: "official_exists",
    });
    const other = await createUser(db);
    const p = await svc.submitPracticeGuess({ userId: other, guestHash: null }, qids[0], "100");
    expect(p.ok && p.attempt.score).toBe(1000);
    const [{ n }] = await db.owner`select count(*)::int as n from public.daily_results where user_id = ${other}`;
    expect(n).toBe(0);
    const archive = await svc.getArchiveState({ userId: other, guestHash: null }, today);
    if (!archive.available) throw new Error("archive unavailable");
    expect(archive.questions[0].practice?.score).toBe(1000);
    expect(archive.questions[0].official).toBeNull();
    expect(archive.questions[1].reveal).toBeNull();
    const list = await svc.listArchive({ userId: other, guestHash: null }, null, 10);
    expect(list.map((i) => i.gameDate)).toEqual(["2026-10-17", "2026-10-16"]);
    expect(list[1]).toMatchObject({ practiceAnswered: 1, officialAnswered: 0 });
    const rev = await svc.revealArchiveAnswer(qids[1]);
    expect(rev.ok).toBe(true);
    await db.setNow(noonEt(today));
    expect((await svc.revealArchiveAnswer(qids[1])).ok).toBe(false);
  });

  it("rate limits with a shared database counter", async () => {
    const bucket = `test:${Math.random()}`;
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await svc.rateLimit(bucket, 60, 5));
    expect(results).toEqual([true, true, true, true, true, false]);
  });
});
