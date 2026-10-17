import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../db/harness";
import { createAdmin, createUser, guestToken, noonEt, playSet, publishSet } from "../db/fixtures";

let db: TestDb;
let adminId: string;
let svc: typeof import("@/lib/game/service");
let day1: { setId: string; questionIds: [string, string, string] };
let day2: { setId: string; questionIds: [string, string, string] };

beforeAll(async () => {
  db = await createTestDb();
  process.env.DATABASE_URL = db.appUrl;
  svc = await import("@/lib/game/service");
  adminId = await createAdmin(db);
  day1 = await publishSet(db, adminId, "2026-10-15");
  day2 = await publishSet(db, adminId, "2026-10-16");
});

afterAll(async () => {
  await db?.drop();
});

describe("claiming guest progress", () => {
  it("transfers official attempts atomically, preserving timestamps and snapshots", async () => {
    const g = guestToken();
    await svc.createGuestSession(g.hash, 30);
    await db.setNow(noonEt("2026-10-15"));
    await playSet(null, g.hash, day1.questionIds, ["100", "25000", "4000000000"]);
    await db.setNow(noonEt("2026-10-16"));
    await playSet(null, g.hash, day2.questionIds.slice(0, 2), ["200", "25000"]);

    const before = await db.owner`
      select a.question_id, a.submitted_at, a.answer_snapshot, a.score from public.official_attempts a
        join public.guest_sessions s on s.id = a.guest_session_id where s.token_hash = ${g.hash} order by a.question_id`;
    expect(before).toHaveLength(5);

    const userId = await createUser(db);
    expect(await svc.guestSummary(g.hash)).toEqual({ valid: true, attempts: 5, sets: 2 });
    const res = await svc.claimGuestSession(userId, g.hash);
    expect(res).toEqual({ ok: true, setsTransferred: 2, attemptsTransferred: 5, setsSkipped: 0 });

    const after = await db.owner`
      select question_id, submitted_at, answer_snapshot, score, guest_session_id, claimed_from_guest_session_id
        from public.official_attempts where user_id = ${userId} order by question_id`;
    expect(after).toHaveLength(5);
    after.forEach((row, i) => {
      expect(row.submitted_at).toEqual(before[i].submitted_at);
      expect(row.answer_snapshot).toBe(before[i].answer_snapshot);
      expect(row.score).toBe(before[i].score);
      expect(row.guest_session_id).toBeNull();
      expect(row.claimed_from_guest_session_id).not.toBeNull();
    });

    // Day 1 complete → daily result; day 2 partial → none, but the user can finish it.
    const results = await db.owner`select game_date::text as d, total_score from public.daily_results where user_id = ${userId}`;
    expect(results).toEqual([{ d: "2026-10-15", total_score: 3000 }]);
    const finish = await svc.submitOfficialGuess({ userId, guestHash: null }, day2.questionIds[2], "4000000000");
    expect(finish.ok && finish.progress?.completed).toBe(true);
    // Day 1 + day 2 consecutive → streak 2
    expect(await svc.getStreaks(userId)).toEqual({ current: 2, best: 2 });
  });

  it("refuses a second claim and invalidates the guest session", async () => {
    const g = guestToken();
    await svc.createGuestSession(g.hash, 30);
    await playSet(null, g.hash, day2.questionIds.slice(0, 1), ["100"]);
    const a = await createUser(db);
    const b = await createUser(db);
    expect((await svc.claimGuestSession(a, g.hash)).ok).toBe(true);
    expect(await svc.claimGuestSession(b, g.hash)).toEqual({ ok: false, error: "already_claimed" });
    expect(await svc.claimGuestSession(a, g.hash)).toEqual({ ok: false, error: "already_claimed" });
    // A claimed session can no longer submit.
    expect(await svc.submitOfficialGuess({ userId: null, guestHash: g.hash }, day2.questionIds[1], "5")).toEqual({
      ok: false,
      error: "guest_expired",
    });
  });

  it("requires the real token: guessing a hash or session id does not work", async () => {
    const userId = await createUser(db);
    expect(await svc.claimGuestSession(userId, guestToken().hash)).toEqual({ ok: false, error: "no_guest_session" });
  });

  it("rejects expired sessions", async () => {
    const g = guestToken();
    await svc.createGuestSession(g.hash, 30);
    await db.owner`update public.guest_sessions set created_at = now() - interval '2 days', expires_at = now() - interval '1 day' where token_hash = ${g.hash}`;
    expect(await svc.claimGuestSession(await createUser(db), g.hash)).toEqual({ ok: false, error: "guest_expired" });
  });

  it("skips sets the user already played, so points are never double-counted", async () => {
    const userId = await createUser(db);
    await playSet(userId, null, day2.questionIds, ["100", "25000", "4000000000"]);
    const g = guestToken();
    await svc.createGuestSession(g.hash, 30);
    await playSet(null, g.hash, day2.questionIds, ["1", "1", "1"]);
    const res = await svc.claimGuestSession(userId, g.hash);
    expect(res).toEqual({ ok: true, setsTransferred: 0, attemptsTransferred: 0, setsSkipped: 1 });
    const [r] = await db.owner`select total_score from public.daily_results where user_id = ${userId}`;
    expect(r.total_score).toBe(3000);
    const [{ n }] = await db.owner`select count(*)::int as n from public.official_attempts where user_id = ${userId}`;
    expect(n).toBe(3);
  });

  it("never converts practice attempts into official scores", async () => {
    await db.setNow(noonEt("2026-10-17"));
    const g = guestToken();
    await svc.createGuestSession(g.hash, 30);
    const p = await svc.submitPracticeGuess({ userId: null, guestHash: g.hash }, day1.questionIds[0], "100");
    expect(p.ok).toBe(true);
    const userId = await createUser(db);
    expect(await svc.claimGuestSession(userId, g.hash)).toEqual({
      ok: true,
      setsTransferred: 0,
      attemptsTransferred: 0,
      setsSkipped: 0,
    });
    const [{ n }] = await db.owner`select count(*)::int as n from public.official_attempts where user_id = ${userId}`;
    expect(n).toBe(0);
    await db.setNow(noonEt("2026-10-16"));
  });

  it("is safe under concurrent claims of the same session", async () => {
    const g = guestToken();
    await svc.createGuestSession(g.hash, 30);
    await playSet(null, g.hash, day2.questionIds, ["100", "25000", "4000000000"]);
    const users = await Promise.all([createUser(db), createUser(db), createUser(db)]);
    const results = await Promise.all(users.map((u) => svc.claimGuestSession(u, g.hash)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const [{ n }] = await db.owner`
      select count(*)::int as n from public.daily_results where user_id = any(${users}::uuid[])`;
    expect(n).toBe(1);
  });
});
