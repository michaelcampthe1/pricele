import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

export type PlayerStats = {
  total_points: number;
  games_completed: number;
  average_daily_score: number | null;
  highest_daily_score: number | null;
  questions_answered: number;
  average_question_score: number | null;
  perfect_guesses: number;
  mean_absolute_percentage_error: number | null;
  median_absolute_percentage_error: number | null;
  current_streak: number;
  best_streak: number;
  by_difficulty: Partial<Record<"easy" | "medium" | "hard", { answered: number; average_score: number }>>;
  recent_results: {
    game_date: string;
    total_score: number;
    easy_score: number;
    medium_score: number;
    hard_score: number;
    perfect_guesses: number;
  }[];
};

/** Statistics derived in SQL from authoritative records. Callers enforce visibility. */
export async function getPlayerStats(userId: string): Promise<PlayerStats> {
  const { data, error } = await createServiceClient().rpc("get_player_stats", { p_user_id: userId });
  if (error) throw new Error(`stats_failed: ${error.message}`);
  return data as unknown as PlayerStats;
}
