import "server-only";
import { createPublicClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { formatGameDate } from "@/lib/dates";
import type { Player } from "./identity";
import type { PublicDailySet, PublicQuestion, QuestionResult, Reveal } from "./types";

type SetRow = {
  id: string;
  game_date: string;
  is_sample: boolean;
  daily_set_questions: {
    position: number;
    questions: {
      id: string;
      prompt: string;
      context: string | null;
      difficulty: PublicQuestion["difficulty"];
      status: string;
      image_url: string | null;
      image_alt: string | null;
      image_credit: string | null;
      correction_note: string | null;
    } | null;
  }[];
};

const SET_SELECT =
  "id, game_date, is_sample, daily_set_questions(position, questions(id, prompt, context, difficulty, status, image_url, image_alt, image_credit, correction_note))";

function mapSet(row: SetRow): PublicDailySet {
  const questions = row.daily_set_questions
    .filter((dsq) => dsq.questions)
    .map((dsq) => {
      const q = dsq.questions!;
      return {
        id: q.id,
        position: dsq.position as 1 | 2 | 3,
        difficulty: q.difficulty,
        prompt: q.prompt,
        context: q.context,
        imageUrl: q.image_url,
        imageAlt: q.image_alt,
        imageCredit: q.image_credit,
        withdrawn: q.status === "withdrawn",
        correctionNote: q.correction_note,
      };
    })
    .sort((a, b) => a.position - b.position);
  return { id: row.id, gameDate: row.game_date, isSample: row.is_sample, questions };
}

/**
 * The live set for a game date, read through the anonymous client: RLS only exposes sets
 * whose date has arrived, and the questions table exposes no answer data at all.
 */
export async function getLiveSet(gameDate: string): Promise<PublicDailySet | null> {
  const { data, error } = await createPublicClient()
    .from("daily_sets")
    .select(SET_SELECT)
    .eq("game_date", gameDate)
    .in("status", ["scheduled", "published"])
    .maybeSingle();
  if (error) throw new Error(`daily_set_read_failed: ${error.message}`);
  if (!data) return null;
  return mapSet(data as unknown as SetRow);
}

export type ArchiveEntry = { id: string; gameDate: string; isSample: boolean };

/** Past live sets, newest first, keyset-paginated by date. */
export async function listArchive(before: string, limit = 20): Promise<{ entries: ArchiveEntry[]; hasMore: boolean }> {
  const { data, error } = await createPublicClient()
    .from("daily_sets")
    .select("id, game_date, is_sample")
    .in("status", ["scheduled", "published"])
    .lt("game_date", before)
    .order("game_date", { ascending: false })
    .limit(limit + 1);
  if (error) throw new Error(`archive_read_failed: ${error.message}`);
  const rows = data ?? [];
  return {
    entries: rows.slice(0, limit).map((r) => ({ id: r.id, gameDate: r.game_date, isSample: r.is_sample })),
    hasMore: rows.length > limit,
  };
}

function referenceLabel(date: string | null, period: string | null): string | null {
  if (period) return period;
  if (date) return `As of ${formatGameDate(date, "medium")}`;
  return null;
}

/**
 * Answer explanations and sources. Trusted server access only; callers must only request
 * questions the player has already answered (or past questions explicitly revealed).
 */
export async function getReveals(questionIds: string[]): Promise<Map<string, Reveal & { answer: string }>> {
  const out = new Map<string, Reveal & { answer: string }>();
  if (questionIds.length === 0) return out;
  const svc = createServiceClient();
  const [answers, sources, questions] = await Promise.all([
    svc
      .from("question_answers")
      .select("question_id, answer_amount::text, answer_definition, explanation, reference_date, reference_period")
      .in("question_id", questionIds),
    svc
      .from("question_sources")
      .select("question_id, title, publisher, source_url, published_at, created_at")
      .in("question_id", questionIds)
      .order("created_at"),
    svc.from("questions").select("id, correction_note").in("id", questionIds),
  ]);
  if (answers.error || sources.error || questions.error) throw new Error("reveal_read_failed");
  for (const a of answers.data) {
    out.set(a.question_id, {
      answer: String(a.answer_amount),
      answerDefinition: a.answer_definition,
      explanation: a.explanation,
      referenceLabel: referenceLabel(a.reference_date, a.reference_period),
      correctionNote: questions.data.find((q) => q.id === a.question_id)?.correction_note ?? null,
      sources: sources.data
        .filter((s) => s.question_id === a.question_id)
        .map((s) => ({ title: s.title, publisher: s.publisher, url: s.source_url, publishedAt: s.published_at })),
    });
  }
  return out;
}

function ownerFilter(player: Exclude<Player, { kind: "anonymous" }>) {
  return player.kind === "user"
    ? (["user_id", player.userId] as const)
    : (["guest_session_id", player.guestSessionId] as const);
}

/** The player's stored official results for one set, with reveal details. */
export async function getOfficialResults(player: Player, set: PublicDailySet): Promise<Map<string, QuestionResult>> {
  const results = new Map<string, QuestionResult>();
  if (player.kind === "anonymous") return results;
  const [column, value] = ownerFilter(player);
  const { data, error } = await createServiceClient()
    .from("official_attempts")
    .select("question_id, position, guess_amount::text, answer_snapshot::text, score, absolute_percentage_error::text, voided, original_score")
    .eq("daily_set_id", set.id)
    .eq(column, value);
  if (error) throw new Error(`attempts_read_failed: ${error.message}`);
  const reveals = await getReveals(data.map((a) => a.question_id));
  for (const a of data) {
    const reveal = reveals.get(a.question_id);
    if (!reveal) continue;
    results.set(a.question_id, {
      questionId: a.question_id,
      position: a.position as 1 | 2 | 3,
      mode: "official",
      guess: String(a.guess_amount),
      answer: String(a.answer_snapshot),
      score: a.score,
      percentageError: String(a.absolute_percentage_error),
      voided: a.voided,
      originalScore: a.original_score,
      reveal,
    });
  }
  return results;
}

/** The player's practice results for one (past) set. */
export async function getPracticeResults(player: Player, set: PublicDailySet): Promise<Map<string, QuestionResult>> {
  const results = new Map<string, QuestionResult>();
  if (player.kind === "anonymous") return results;
  const [column, value] = ownerFilter(player);
  const { data, error } = await createServiceClient()
    .from("practice_attempts")
    .select("question_id, guess_amount::text, answer_snapshot::text, score, absolute_percentage_error::text")
    .eq("daily_set_id", set.id)
    .eq(column, value);
  if (error) throw new Error(`practice_read_failed: ${error.message}`);
  const reveals = await getReveals(data.map((a) => a.question_id));
  for (const a of data) {
    const reveal = reveals.get(a.question_id);
    const question = set.questions.find((q) => q.id === a.question_id);
    if (!reveal || !question) continue;
    results.set(a.question_id, {
      questionId: a.question_id,
      position: question.position,
      mode: "practice",
      guess: String(a.guess_amount),
      answer: String(a.answer_snapshot),
      score: a.score,
      percentageError: String(a.absolute_percentage_error),
      voided: false,
      originalScore: null,
      reveal,
    });
  }
  return results;
}

export type DailySummary = {
  answered: number;
  required: number;
  total: number;
  complete: boolean;
  byPosition: Record<1 | 2 | 3, number | null>;
};

export function summarize(set: PublicDailySet, results: Map<string, QuestionResult>): DailySummary {
  const scorable = set.questions.filter((q) => !q.withdrawn);
  const byPosition: DailySummary["byPosition"] = { 1: null, 2: null, 3: null };
  let total = 0;
  let answered = 0;
  for (const q of scorable) {
    const r = results.get(q.id);
    if (r && !r.voided && r.score !== null) {
      byPosition[q.position] = r.score;
      total += r.score;
      answered += 1;
    }
  }
  return { answered, required: scorable.length, total, complete: scorable.length > 0 && answered === scorable.length, byPosition };
}
