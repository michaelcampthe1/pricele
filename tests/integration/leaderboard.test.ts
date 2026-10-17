import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../db/harness";
import { createAdmin, createUser, noonEt, playSet, publishSet } from "../db/fixtures";

let db: TestDb;
let adminId: string;
let svc: typeof import("@/lib/game/service");
const sets: Record<string, { setId: string; questionIds: [string, string, string] }> = {};

// Answers for every set: 100 / 25,000 / 4,000,000,000
const PERFECT = ["100", "25000", "4000000000"];

beforeAll(async () => {
  db = await createTestDb();
  process.env.DATABASE_URL = db.appUrl;
  svc = await import("@/lib/game/service");
  adminId = await createAdmin(db);
  // Sun 10/11, Mon 10/12, Tue 10/13, (Wed 10/14 has no set), Thu 10/15, Fri 10/16
  for (const d of ["2026-10-11", "2026-10-12", "2026-10-13", "2026-10-15", "2026-10-16"]) {
    sets[d] = await publishSet(db, adminId, d);
  }
});

afterAll(async () => {
  await db?.drop();
});

async function playOn(date: string, userId: string, guesses: string[]) {
  await db.setNow(noonEt(date));
  return playSet(userId, null, sets[date].questionIds, guesses);
}

describe("daily leaderboard and tie-breaks", () => {
  it("ranks by total, then perfect guesses, then hard score, then earliest final submission", async () => {
    const date = "2026-10-12";
    const a = await createUser(db, "alice");
    const b = await createUser(db, "bob");
    const c = await createUser(db, "carol");
    const d = await createUser(db, "dave");
    const e = await createUser(db, "erin");

    // alice: 1000 + 591 + 591 = 2182, one perfect
    await playOn(date, a, ["100", "50000", "8000000000"]);
    // bob: 591 + 1000 + 591 = 2182, one perfect, same hard → falls to timestamp (bob later than alice)
    await playOn(date, b, ["200", "25000", "8000000000"]);
    // carol: 591 + 591 + 1000 = 2182, one perfect, higher hard → ahead of alice and bob
    await playOn(date, c, ["200", "50000", "4000000000"]);
    // dave: 3000 → first
    await playOn(date, d, PERFECT);
    // erin: partial (2 of 3) → not ranked
    await db.setNow(noonEt(date));
    await playSet(e, null, sets[date].questionIds.slice(0, 2), ["100", "25000"]);

    const rows = await svc.getDailyLeaderboard(date);
    expect(rows.map((r) => [r.rank, r.username, r.totalScore])).toEqual([
      [1, "dave", 3000],
      [2, "carol", 2182],
      [3, "alice", 2182],
      [4, "bob", 2182],
    ]);
    expect(rows[0].participants).toBe(4);
    expect(await svc.getUserDailyRank(b, date)).toEqual({ rank: 4, participants: 4 });
    expect(await svc.getUserDailyRank(e, date)).toBeNull();
  });

  it("assigns equal ranks only when every tie-break value is identical", async () => {
    const date = "2026-10-13";
    const x = await createUser(db, "xavier");
    const y = await createUser(db, "yolanda");
    await playOn(date, x, ["200", "50000", "8000000000"]);
    await playOn(date, y, ["200", "50000", "8000000000"]);
    // Force identical completion timestamps to exercise the equal-rank path.
    await db.owner`update public.daily_results set completed_at = '2026-10-13T16:00:00Z' where game_date = ${date}`;
    const rows = await svc.getDailyLeaderboard(date);
    expect(rows.map((r) => [r.rank, r.username])).toEqual([
      [1, "xavier"],
      [1, "yolanda"],
    ]);
  });

  it("hides private profiles' names and excludes suspended players", async () => {
    const date = "2026-10-15";
    const p = await createUser(db, "privatepat");
    const s = await createUser(db, "suspendedsam");
    await playOn(date, p, PERFECT);
    await playOn(date, s, PERFECT);
    await svc.updateProfile(p, { displayName: null, avatarUrl: null, isPublic: false });
    const { admin } = await import("@/lib/admin/service");
    await admin.setSuspension(adminId, s, true, "Cheating investigation");
    const rows = await svc.getDailyLeaderboard(date);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ username: null, isPublic: false, totalScore: 3000 });
    await admin.setSuspension(adminId, s, false, null);
    expect(await svc.getDailyLeaderboard(date)).toHaveLength(2);
  });

  it("returns an empty list (not fake data) when nobody qualifies", async () => {
    expect(await svc.getDailyLeaderboard("2026-10-11")).toEqual([]);
  });
});

describe("weekly and all-time leaderboards", () => {
  it("uses Monday–Sunday game weeks in Eastern Time and ignores practice", async () => {
    const w = await createUser(db, "wendy");
    await playOn("2026-10-11", w, PERFECT); // Sunday: previous week
    await playOn("2026-10-12", w, PERFECT); // Monday: this week
    await playOn("2026-10-16", w, ["200", "25000", "4000000000"]); // Friday: 591 + 1000 + 1000
    await db.setNow(noonEt("2026-10-16"));
    const other = await createUser(db, "practicer");
    // practice on an archive day (no official points)
    const pr = await svc.submitPracticeGuess({ userId: other, guestHash: null }, sets["2026-10-13"].questionIds[0], "100");
    expect(pr.ok).toBe(true);

    const weekly = await svc.getPeriodLeaderboard("2026-10-12", "2026-10-18");
    const wendy = weekly.find((r) => r.username === "wendy");
    expect(wendy).toMatchObject({ totalScore: 3000 + 2591, gamesCompleted: 2, perfectGuesses: 5 });
    expect(weekly.find((r) => r.username === "practicer")).toBeUndefined();

    const prevWeek = await svc.getPeriodLeaderboard("2026-10-05", "2026-10-11");
    expect(prevWeek.find((r) => r.username === "wendy")).toMatchObject({ totalScore: 3000, gamesCompleted: 1 });

    const allTime = await svc.getPeriodLeaderboard(null, null);
    expect(allTime[0]).toMatchObject({ username: "wendy", totalScore: 8591, gamesCompleted: 3 });
  });
});

describe("streaks", () => {
  it("counts consecutive game days, skips days without a published set, and never counts partial days", async () => {
    const u = await createUser(db, "streaker");
    await playOn("2026-10-11", u, PERFECT);
    await playOn("2026-10-12", u, PERFECT);
    await playOn("2026-10-13", u, PERFECT);
    // 10/14 had no set — does not break the streak
    await playOn("2026-10-15", u, PERFECT);
    expect(await svc.getStreaks(u)).toEqual({ current: 4, best: 4 });

    // On 10/16 before playing: day not over → streak stays 4
    await db.setNow(noonEt("2026-10-16"));
    expect(await svc.getStreaks(u)).toEqual({ current: 4, best: 4 });
    // Partial completion doesn't extend it
    await playSet(u, null, sets["2026-10-16"].questionIds.slice(0, 2), ["100", "25000"]);
    expect(await svc.getStreaks(u)).toEqual({ current: 4, best: 4 });
    // On 10/17 (no set), 10/16 was missed (incomplete) → current resets, best preserved
    await db.setNow(noonEt("2026-10-17"));
    expect(await svc.getStreaks(u)).toEqual({ current: 0, best: 4 });
  });

  it("breaks on a missed game day", async () => {
    const u = await createUser(db, "gappy");
    await playOn("2026-10-11", u, PERFECT);
    await playOn("2026-10-13", u, PERFECT); // missed 10/12
    await playOn("2026-10-15", u, PERFECT);
    await db.setNow(noonEt("2026-10-16"));
    expect(await svc.getStreaks(u)).toEqual({ current: 2, best: 2 });
  });

  it("reports profile statistics from real records only", async () => {
    const fresh = await createUser(db, "newbie");
    const empty = await svc.getProfileStats(fresh);
    expect(empty).toMatchObject({ totalPoints: 0, gamesCompleted: 0, averageDailyScore: null, currentStreak: 0, recent: [] });

    const u = await createUser(db, "statsy");
    await playOn("2026-10-15", u, ["200", "25000", "400000000"]);
    await db.setNow(noonEt("2026-10-15"));
    const stats = await svc.getProfileStats(u);
    expect(stats).toMatchObject({
      totalPoints: 591 + 1000 + 303,
      gamesCompleted: 1,
      highestDailyScore: 1894,
      questionsAnswered: 3,
      perfectGuesses: 1,
      currentStreak: 1,
    });
    expect(stats.byDifficulty.hard).toEqual({ answered: 1, averageScore: 303 });
    expect(stats.recent[0]).toMatchObject({ gameDate: "2026-10-15", total: 1894 });
  });
});
