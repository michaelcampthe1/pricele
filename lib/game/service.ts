import "server-only";
import { sql } from "@/lib/db";
import type {
  ArchiveListItem,
  ArchiveState,
  GameState,
  LeaderboardRow,
  Profile,
  ProfileStats,
  Reveal,
  SubmitResult,
} from "@/lib/game/types";

/**
 * Typed wrappers around the privileged database functions. Callers must resolve the
 * player's identity first (see lib/auth/player.ts): either a verified Supabase user id
 * or the SHA-256 hash of the guest cookie token — never values taken from the request body.
 */

export type PlayerRef = { userId: string | null; guestHash: Buffer | null };

const NONE: PlayerRef = { userId: null, guestHash: null };

function idOf(p: PlayerRef) {
  return { user: p.userId, guest: p.userId ? null : p.guestHash };
}

export async function getGameState(player: PlayerRef = NONE, date?: string): Promise<GameState> {
  const { user, guest } = idOf(player);
  const [row] = await sql()`select pricele.game_state(${user}::uuid, ${guest}::bytea, ${date ?? null}::date) as r`;
  return row.r as GameState;
}

export async function submitOfficialGuess(player: PlayerRef, questionId: string, guess: string): Promise<SubmitResult> {
  const { user, guest } = idOf(player);
  const [row] = await sql()`
    select pricele.submit_official_guess(${user}::uuid, ${guest}::bytea, ${questionId}::uuid, ${guess}::numeric) as r`;
  return row.r as SubmitResult;
}

export async function submitPracticeGuess(player: PlayerRef, questionId: string, guess: string): Promise<SubmitResult> {
  const { user, guest } = idOf(player);
  const [row] = await sql()`
    select pricele.submit_practice_guess(${user}::uuid, ${guest}::bytea, ${questionId}::uuid, ${guess}::numeric) as r`;
  return row.r as SubmitResult;
}

export async function revealArchiveAnswer(
  questionId: string,
): Promise<{ ok: true; reveal: Reveal } | { ok: false; error: string }> {
  const [row] = await sql()`select pricele.reveal_archive_answer(${questionId}::uuid) as r`;
  return row.r;
}

export async function getArchiveState(player: PlayerRef, date: string): Promise<ArchiveState> {
  const { user, guest } = idOf(player);
  const [row] = await sql()`select pricele.archive_state(${user}::uuid, ${guest}::bytea, ${date}::date) as r`;
  return row.r as ArchiveState;
}

export async function listArchive(player: PlayerRef, before: string | null, limit = 20): Promise<ArchiveListItem[]> {
  const { user, guest } = idOf(player);
  const rows = await sql()`
    select * from pricele.archive_list(${user}::uuid, ${guest}::bytea, ${before}::date, ${limit}::int)`;
  return rows.map((r) => ({
    gameDate: toDateString(r.game_date),
    setId: r.set_id,
    difficulties: r.difficulties,
    officialAnswered: r.official_answered,
    officialTotal: r.official_total,
    practiceAnswered: r.practice_answered,
  }));
}

function toDateString(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

export async function getDailyLeaderboard(date: string, limit = 50, offset = 0): Promise<LeaderboardRow[]> {
  const rows = await sql()`select * from pricele.leaderboard_daily(${date}::date, ${limit}::int, ${offset}::int)`;
  return rows.map((r) => ({
    rank: Number(r.rank),
    userId: r.user_id,
    username: r.username,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    isPublic: r.is_public,
    totalScore: r.total_score,
    easyScore: r.easy_score,
    mediumScore: r.medium_score,
    hardScore: r.hard_score,
    perfectGuesses: r.perfect_guesses,
    completedAt: new Date(r.completed_at).toISOString(),
    participants: Number(r.participants),
  }));
}

export async function getPeriodLeaderboard(
  from: string | null,
  to: string | null,
  limit = 50,
  offset = 0,
): Promise<LeaderboardRow[]> {
  const rows = await sql()`
    select * from pricele.leaderboard_period(${from}::date, ${to}::date, ${limit}::int, ${offset}::int)`;
  return rows.map((r) => ({
    rank: Number(r.rank),
    userId: r.user_id,
    username: r.username,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    isPublic: r.is_public,
    totalScore: Number(r.total_score),
    hardScore: Number(r.hard_score),
    perfectGuesses: Number(r.perfect_guesses),
    gamesCompleted: Number(r.games_completed),
    completedAt: new Date(r.final_submission_at).toISOString(),
    participants: Number(r.participants),
  }));
}

export async function getUserDailyRank(userId: string, date: string): Promise<{ rank: number; participants: number } | null> {
  const [row] = await sql()`select pricele.user_daily_rank(${userId}::uuid, ${date}::date) as r`;
  return row.r ? { rank: Number(row.r.rank), participants: Number(row.r.participants) } : null;
}

export type DailyStanding = { rank: number; participants: number; beaten: number };

/** Where this player (account or guest) finished today among everyone who completed the game. */
export async function getDailyStanding(player: PlayerRef, date: string): Promise<DailyStanding | null> {
  const { user, guest } = idOf(player);
  if (!user && !guest) return null;
  const [row] = await sql()`
    select pricele.player_daily_standing(${user}::uuid, ${guest}::bytea, ${date}::date) as r`;
  return row.r
    ? { rank: Number(row.r.rank), participants: Number(row.r.participants), beaten: Number(row.r.beaten) }
    : null;
}

export async function getStreaks(userId: string): Promise<{ current: number; best: number }> {
  const [row] = await sql()`select * from pricele.user_streaks(${userId}::uuid)`;
  return { current: row.current_streak, best: row.best_streak };
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const [row] = await sql()`select pricele.get_profile(${userId}::uuid) as r`;
  return (row.r as Profile) ?? null;
}

export async function getProfileStats(userId: string): Promise<ProfileStats> {
  const [row] = await sql()`select pricele.profile_stats(${userId}::uuid) as r`;
  return normalizeStats(row.r);
}

export async function getPublicProfile(
  username: string,
): Promise<{ username: string; displayName: string | null; avatarUrl: string | null; createdAt: string; stats: ProfileStats } | null> {
  const [row] = await sql()`select pricele.public_profile(${username}) as r`;
  if (!row.r) return null;
  return { ...row.r, stats: normalizeStats(row.r.stats) };
}

export async function getPublicResult(username: string, date: string) {
  const [row] = await sql()`select pricele.public_result(${username}, ${date}::date) as r`;
  return row.r as
    | { username: string; displayName: string | null; gameDate: string; total: number; easy: number; medium: number; hard: number }
    | null;
}

function num(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

function normalizeStats(s: Record<string, unknown>): ProfileStats {
  return {
    totalPoints: Number(s.totalPoints ?? 0),
    gamesCompleted: Number(s.gamesCompleted ?? 0),
    averageDailyScore: num(s.averageDailyScore),
    highestDailyScore: num(s.highestDailyScore),
    questionsAnswered: Number(s.questionsAnswered ?? 0),
    averageQuestionScore: num(s.averageQuestionScore),
    perfectGuesses: Number(s.perfectGuesses ?? 0),
    medianPercentageError: num(s.medianPercentageError),
    averagePercentageError: num(s.averagePercentageError),
    byDifficulty: (s.byDifficulty as ProfileStats["byDifficulty"]) ?? {},
    currentStreak: Number(s.currentStreak ?? 0),
    bestStreak: Number(s.bestStreak ?? 0),
    recent: (s.recent as ProfileStats["recent"]) ?? [],
  };
}

export async function updateProfile(
  userId: string,
  input: { displayName: string | null; avatarUrl: string | null; isPublic: boolean },
): Promise<{ ok: boolean; error?: string }> {
  const [row] = await sql()`
    select pricele.update_profile(${userId}::uuid, ${input.displayName}, ${input.avatarUrl}, ${input.isPublic}) as r`;
  return row.r;
}

export async function updateUsername(userId: string, username: string): Promise<{ ok: boolean; error?: string; username?: string }> {
  const [row] = await sql()`select pricele.update_username(${userId}::uuid, ${username}) as r`;
  return row.r;
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  const [row] = await sql()`select pricele.username_available(${username}) as r`;
  return row.r;
}

export async function deleteAccount(userId: string): Promise<{ ok: boolean }> {
  const [row] = await sql()`select pricele.delete_account(${userId}::uuid) as r`;
  return row.r;
}

export async function createGuestSession(tokenHash: Buffer, ttlDays: number): Promise<string> {
  const [row] = await sql()`select pricele.create_guest_session(${tokenHash}::bytea, ${ttlDays}::int) as id`;
  return row.id;
}

export async function resolveGuest(tokenHash: Buffer): Promise<string | null> {
  const [row] = await sql()`select pricele.resolve_guest(${tokenHash}::bytea) as id`;
  return row.id ?? null;
}

export async function guestSummary(tokenHash: Buffer): Promise<{ valid: boolean; attempts: number; sets: number }> {
  const [row] = await sql()`select pricele.guest_summary(${tokenHash}::bytea) as r`;
  return { valid: row.r.valid, attempts: Number(row.r.attempts), sets: Number(row.r.sets) };
}

export async function claimGuestSession(
  userId: string,
  tokenHash: Buffer,
): Promise<
  | { ok: true; setsTransferred: number; attemptsTransferred: number; setsSkipped: number }
  | { ok: false; error: "unauthorized" | "no_guest_session" | "already_claimed" | "guest_expired" }
> {
  const [row] = await sql()`select pricele.claim_guest_session(${userId}::uuid, ${tokenHash}::bytea) as r`;
  return row.r;
}

export async function reportQuestion(player: PlayerRef, questionId: string, message: string) {
  const { user, guest } = idOf(player);
  const [row] = await sql()`
    select pricele.report_question(${user}::uuid, ${guest}::bytea, ${questionId}::uuid, ${message}) as r`;
  return row.r as { ok: boolean; error?: string };
}

/** Shared, database-backed rate limiter. Returns true if allowed. Fails open on DB errors only for reads. */
export async function rateLimit(bucket: string, windowSeconds: number, max: number): Promise<boolean> {
  const [row] = await sql()`select pricele.rate_limit(${bucket}, ${windowSeconds}::int, ${max}::int) as ok`;
  return row.ok;
}
