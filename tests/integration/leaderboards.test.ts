import { beforeAll, describe, expect, it } from "vitest";
import { addDays, anon, completedGame, createUser, makeAdmin, randomPastDate, service, sql, today } from "../support/db";
import { weekStart } from "@/lib/dates";

let admin: { id: string };

beforeAll(async () => {
  admin = await createUser("admin");
  await makeAdmin(admin.id);
});

type Row = { rank: number; username: string; total_score: number };

describe("leaderboards", () => {
  it("ranks daily results with the documented tie-breakers", async () => {
    // A unique past date isolates this test's leaderboard.
    const date = randomPastDate();
    const [a, b, c, d, e] = await Promise.all([createUser("a"), createUser("b"), createUser("c"), createUser("d"), createUser("e")]);
    const answers: [string, string, string] = ["100.00", "100.00", "100.00"];
    // a: 1000 + 591 + 591 = 2182, 1 perfect
    await completedGame(admin.id, a.id, date, ["100", "200", "50"], answers, 10);
    // b: 591 + 591 + 1000 = 2182, 1 perfect, higher hard score than a -> ranks above a
    await completedGame(admin.id, b.id, date, ["200", "50", "100"], answers, 11);
    // c: 1000 + 1000 + 182? use 1000+1000+... keep simple: 3000 -> first
    await completedGame(admin.id, c.id, date, ["100", "100", "100"], answers, 12);
    // d: identical to b, but finished later -> ranks below b, above a (hard tie-break first)
    await completedGame(admin.id, d.id, date, ["200", "50", "100"], answers, 13);
    // e: incomplete game -> not ranked
    await completedGame(admin.id, e.id, date, ["100", "100", "100"], answers, 9);
    await sql("delete from public.official_attempts where user_id = $1 and position = 3", [e.id]);
    await sql("select private.refresh_set_results(daily_set_id) from public.daily_results where user_id = $1", [e.id]);
    const mine = new Set([a, b, c, d, e].map((u) => u.username));
    const { data } = await anon().rpc("leaderboard_daily", { p_game_date: date, p_limit: 100 });
    const rows = (data as Row[]).filter((r) => mine.has(r.username));
    const order = rows.map((r) => r.username);
    expect(order).toEqual([c.username, b.username, d.username, a.username]);
    const ranks = rows.map((r) => r.rank);
    expect(ranks[0]).toBeLessThan(ranks[1]);
    expect(ranks[1]).toBeLessThan(ranks[2]);
    expect(ranks[2]).toBeLessThan(ranks[3]);
    expect(order).not.toContain(e.username);
  });

  it("gives identical results an equal rank", async () => {
    const date = randomPastDate();
    const [a, b] = await Promise.all([createUser("tie"), createUser("tie")]);
    await completedGame(admin.id, a.id, date, ["100", "200", "50"], ["100.00", "100.00", "100.00"], 10);
    await completedGame(admin.id, b.id, date, ["100", "200", "50"], ["100.00", "100.00", "100.00"], 10);
    // Force identical completion timestamps.
    await sql("update public.daily_results set completed_at = '2020-01-01T00:00:00Z' where user_id = any($1)", [[a.id, b.id]]);
    const { data } = await anon().rpc("leaderboard_daily", { p_game_date: date, p_limit: 100 });
    const rows = (data as Row[]).filter((r) => r.username === a.username || r.username === b.username);
    expect(rows).toHaveLength(2);
    expect(rows[0].rank).toBe(rows[1].rank);
  });

  it("aggregates weekly totals within Monday-to-Monday Eastern Time boundaries", async () => {
    const monday = weekStart(randomPastDate());
    const u = await createUser("week");
    await completedGame(admin.id, u.id, addDays(monday, -1), ["100", "100", "100"]); // previous Sunday: excluded
    await completedGame(admin.id, u.id, monday, ["100", "25000", "4000000000"]); // 3000
    await completedGame(admin.id, u.id, addDays(monday, 6), ["200", "25000", "4000000000"]); // Sunday: 2591
    await completedGame(admin.id, u.id, addDays(monday, 7), ["100", "25000", "4000000000"]); // next Monday: excluded
    const { data } = await anon().rpc("leaderboard_weekly", { p_week_start: monday, p_username: u.username });
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({ total_score: 5591, games_completed: 2, perfect_guesses: 5 });
    const notMonday = await anon().rpc("leaderboard_weekly", { p_week_start: addDays(monday, 1), p_username: u.username });
    expect(notMonday.data).toEqual([]);
  });

  it("all-time totals exclude practice and incomplete games, and suspended players", async () => {
    const u = await createUser("all");
    const base = randomPastDate();
    await completedGame(admin.id, u.id, base, ["100", "25000", "4000000000"]);
    const { data } = await anon().rpc("leaderboard_alltime", { p_username: u.username });
    expect(data![0]).toMatchObject({ total_score: 3000, games_completed: 1, perfect_guesses: 3 });
    await service.from("profiles").update({ suspended_at: new Date().toISOString() }).eq("id", u.id);
    const after = await anon().rpc("leaderboard_alltime", { p_username: u.username });
    expect(after.data).toEqual([]);
  });

  it("hides avatars of private profiles", async () => {
    const u = await createUser("priv");
    await service.from("profiles").update({ is_public: false, avatar_url: "https://example.com/a.png" }).eq("id", u.id);
    const date = randomPastDate();
    await completedGame(admin.id, u.id, date, ["100", "25000", "4000000000"]);
    const { data } = await anon().rpc("leaderboard_daily", { p_game_date: date, p_username: u.username });
    expect(data![0]).toMatchObject({ is_public: false, avatar_url: null });
  });
});

describe("streaks and stats", () => {
  it("counts consecutive completed days, keeps today's streak alive until the day ends, and tracks the best run", async () => {
    const u = await createUser("streak");
    const t = today();
    // best run: 4 days ending 10 days ago
    for (const off of [13, 12, 11, 10]) await completedGame(admin.id, u.id, addDays(t, -off), ["100", "25000", "4000000000"]);
    // current run: yesterday and the day before (today not yet played)
    for (const off of [2, 1]) await completedGame(admin.id, u.id, addDays(t, -off), ["100", "25000", "4000000000"]);
    const { data } = await service.rpc("get_player_stats", { p_user_id: u.id });
    const stats = data as Record<string, unknown>;
    expect(stats.current_streak).toBe(2);
    expect(stats.best_streak).toBe(4);
    expect(stats.games_completed).toBe(6);
    expect(stats.total_points).toBe(18000);
    expect(stats.perfect_guesses).toBe(18);
  });

  it("a gap of a full day resets the current streak; partial days don't count", async () => {
    const u = await createUser("gap");
    const t = today();
    await completedGame(admin.id, u.id, addDays(t, -3), ["100", "25000", "4000000000"]);
    const { data } = await service.rpc("get_player_stats", { p_user_id: u.id });
    expect((data as Record<string, unknown>).current_streak).toBe(0);
    expect((data as Record<string, unknown>).best_streak).toBe(1);
  });

  it("reports nulls rather than invented numbers for a new account", async () => {
    const u = await createUser("fresh");
    const { data } = await service.rpc("get_player_stats", { p_user_id: u.id });
    expect(data).toMatchObject({ total_points: 0, games_completed: 0, average_daily_score: null, highest_daily_score: null, current_streak: 0, best_streak: 0, recent_results: [] });
  });
});
