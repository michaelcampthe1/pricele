import "server-only";
import { createPublicClient } from "@/lib/supabase/server";

export type LeaderboardView = "daily" | "weekly" | "alltime";
export const PAGE_SIZE = 25;

export type LeaderboardRow = {
  rank: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isPublic: boolean;
  totalScore: number;
  easyScore?: number;
  mediumScore?: number;
  hardScore?: number;
  gamesCompleted?: number;
  perfectGuesses: number;
  currentStreak?: number;
  bestStreak?: number;
};

export type LeaderboardPage = { rows: LeaderboardRow[]; totalCount: number };

type Raw = Record<string, unknown>;

function map(r: Raw): LeaderboardRow {
  return {
    rank: Number(r.rank),
    username: String(r.username),
    displayName: (r.display_name as string | null) ?? null,
    avatarUrl: (r.avatar_url as string | null) ?? null,
    isPublic: Boolean(r.is_public),
    totalScore: Number(r.total_score),
    easyScore: r.easy_score === undefined ? undefined : Number(r.easy_score),
    mediumScore: r.medium_score === undefined ? undefined : Number(r.medium_score),
    hardScore: r.hard_score === undefined ? undefined : Number(r.hard_score),
    gamesCompleted: r.games_completed === undefined ? undefined : Number(r.games_completed),
    perfectGuesses: Number(r.perfect_guesses ?? 0),
    currentStreak: r.current_streak === undefined ? undefined : Number(r.current_streak),
    bestStreak: r.best_streak === undefined ? undefined : Number(r.best_streak),
  };
}

/**
 * Leaderboards are computed by SQL functions over completed official results (see
 * migrations/..._leaderboards_stats.sql). Only public-safe columns are returned.
 */
export async function getLeaderboard(
  view: LeaderboardView,
  opts: { date?: string; weekStart?: string; page?: number; username?: string; limit?: number },
): Promise<LeaderboardPage> {
  const client = createPublicClient();
  const limit = opts.limit ?? PAGE_SIZE;
  const offset = ((opts.page ?? 1) - 1) * limit;
  const common = { p_limit: limit, p_offset: offset, p_username: opts.username ?? undefined };
  const { data, error } =
    view === "daily"
      ? await client.rpc("leaderboard_daily", { p_game_date: opts.date!, ...common })
      : view === "weekly"
        ? await client.rpc("leaderboard_weekly", { p_week_start: opts.weekStart!, ...common })
        : await client.rpc("leaderboard_alltime", common);
  if (error) throw new Error(`leaderboard_failed: ${error.message}`);
  const rows = (data ?? []) as Raw[];
  return { rows: rows.map(map), totalCount: rows.length ? Number(rows[0].total_count) : 0 };
}
