"use server";

import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/admin";
import { parseUsdInput, PARSE_ERROR_MESSAGES } from "@/lib/money";
import { fail, type ActionResult } from "@/lib/errors";
import { log } from "@/lib/errors/log";
import { rateLimit } from "@/lib/security/rate-limit";
import { getGameDate } from "@/lib/dates";
import { playerForWrite, playerSubject, rpcIdentity, currentPlayer } from "./identity";
import { getLiveSet, getOfficialResults, getReveals, getPracticeResults } from "./queries";
import type { QuestionResult } from "./types";

const submitSchema = z.object({
  questionId: z.string().uuid(),
  guess: z.string().max(40),
});

type RpcAttempt = {
  question_id: string;
  position?: number;
  guess_amount: number | string;
  answer_amount: number | string;
  score: number;
  absolute_percentage_error: number | string;
  voided?: boolean;
};

type RpcResult =
  | { ok: true; already_submitted: boolean; attempt: RpcAttempt; set_complete: boolean | null }
  | { ok: false; error: string };

export type SubmitResult = ActionResult<{
  result: QuestionResult;
  alreadySubmitted: boolean;
  setComplete: boolean | null;
}>;

async function toResult(
  attempt: RpcAttempt,
  mode: "official" | "practice",
  position: 1 | 2 | 3,
): Promise<QuestionResult> {
  const reveal = (await getReveals([attempt.question_id])).get(attempt.question_id);
  if (!reveal) throw new Error("reveal_missing");
  // The answer shown is the snapshot the attempt was scored against, not the live key.
  const details = { answerDefinition: reveal.answerDefinition, explanation: reveal.explanation, referenceLabel: reveal.referenceLabel, sources: reveal.sources, correctionNote: reveal.correctionNote };
  return {
    questionId: attempt.question_id,
    position,
    mode,
    guess: String(attempt.guess_amount),
    answer: String(attempt.answer_amount),
    score: attempt.score,
    percentageError: String(attempt.absolute_percentage_error),
    voided: attempt.voided ?? false,
    originalScore: null,
    reveal: details,
  };
}

/**
 * Official guess for today's game. The score is computed and stored by the database in a
 * single transaction; nothing the client sends besides the question id and the typed amount
 * is used. Repeated calls return the original stored result.
 */
export async function submitOfficialGuess(input: { questionId: string; guess: string }): Promise<SubmitResult> {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_guess");
  const amount = parseUsdInput(parsed.data.guess);
  if (!amount.ok) {
    return { ok: false, error: "invalid_guess", message: PARSE_ERROR_MESSAGES[amount.error], fieldErrors: { guess: PARSE_ERROR_MESSAGES[amount.error] } };
  }

  try {
    const player = await playerForWrite();
    if (player === "rate_limited") return fail("rate_limited");
    if (!(await rateLimit("officialGuess", playerSubject(player)))) return fail("rate_limited");

    const { data, error } = await createServiceClient().rpc("submit_official_guess", {
      p_question_id: parsed.data.questionId,
      // Sent as a decimal string; PostgREST casts it to numeric without float conversion.
      p_guess: amount.value as unknown as number,
      ...rpcIdentity(player),
    });
    if (error) {
      await log("error", "official_guess.rpc_failed", { error: error.message, code: error.code });
      return fail("unavailable");
    }
    const res = data as unknown as RpcResult;
    if (!res.ok) return fail(res.error);

    const result = await toResult(res.attempt, "official", (res.attempt.position ?? 1) as 1 | 2 | 3);
    if (!res.already_submitted) {
      await log("info", "official_guess.submitted", { player: player.kind, score: res.attempt.score });
    }
    // No revalidatePath here: re-rendering /play on the final answer would redirect to
    // /results before the player sees the reveal. All game pages render dynamically.
    return { ok: true, result, alreadySubmitted: res.already_submitted, setComplete: res.set_complete };
  } catch (err) {
    await log("error", "official_guess.failed", { error: err });
    return fail("unavailable");
  }
}

/**
 * Re-reads the player's stored results for today. Used by the client to recover when a
 * submission's response was lost (the attempt may already be saved).
 */
export async function getTodayProgress(): Promise<ActionResult<{ results: QuestionResult[] }>> {
  try {
    const set = await getLiveSet(getGameDate());
    if (!set) return fail("set_not_published");
    const results = await getOfficialResults(await currentPlayer(), set);
    return { ok: true, results: [...results.values()] };
  } catch (err) {
    await log("error", "progress.read_failed", { error: err });
    return fail("unavailable");
  }
}

/** Practice guess for an archive question. Stored separately; never official. */
export async function submitPracticeGuess(input: { questionId: string; guess: string }): Promise<SubmitResult> {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_guess");
  const amount = parseUsdInput(parsed.data.guess);
  if (!amount.ok) {
    return { ok: false, error: "invalid_guess", message: PARSE_ERROR_MESSAGES[amount.error], fieldErrors: { guess: PARSE_ERROR_MESSAGES[amount.error] } };
  }
  try {
    const player = await playerForWrite();
    if (player === "rate_limited") return fail("rate_limited");
    if (!(await rateLimit("practiceGuess", playerSubject(player)))) return fail("rate_limited");

    const { data, error } = await createServiceClient().rpc("submit_practice_guess", {
      p_question_id: parsed.data.questionId,
      p_guess: amount.value as unknown as number,
      ...rpcIdentity(player),
    });
    if (error) {
      await log("error", "practice_guess.rpc_failed", { error: error.message });
      return fail("unavailable");
    }
    const res = data as unknown as RpcResult;
    if (!res.ok) return fail(res.error);
    const { data: dsq } = await createServiceClient()
      .from("daily_set_questions")
      .select("position")
      .eq("question_id", parsed.data.questionId)
      .single();
    const result = await toResult(res.attempt, "practice", (dsq?.position ?? 1) as 1 | 2 | 3);
    return { ok: true, result, alreadySubmitted: res.already_submitted, setComplete: null };
  } catch (err) {
    await log("error", "practice_guess.failed", { error: err });
    return fail("unavailable");
  }
}

/**
 * Shows the answer to a past (archive) question without recording a guess. Never available
 * for today's game or a future one: the set must be live and strictly before today.
 */
export async function revealArchiveAnswer(input: { questionId: string; gameDate: string }): Promise<ActionResult<{ result: QuestionResult }>> {
  const parsed = z.object({ questionId: z.string().uuid(), gameDate: z.string() }).safeParse(input);
  if (!parsed.success) return fail("question_not_found");
  if (parsed.data.gameDate >= getGameDate()) return fail("practice_not_available");
  try {
    const set = await getLiveSet(parsed.data.gameDate);
    const question = set?.questions.find((q) => q.id === parsed.data.questionId);
    if (!set || !question) return fail("question_not_found");
    const player = await currentPlayer();
    const official = (await getOfficialResults(player, set)).get(question.id);
    if (official) return { ok: true, result: official };
    const practice = (await getPracticeResults(player, set)).get(question.id);
    if (practice) return { ok: true, result: practice };

    const reveal = (await getReveals([question.id])).get(question.id);
    if (!reveal) return fail("answer_unavailable");
    const { answer, ...details } = reveal;
    return {
      ok: true,
      result: {
        questionId: question.id,
        position: question.position,
        mode: "reveal",
        guess: null,
        answer,
        score: null,
        percentageError: null,
        voided: false,
        originalScore: null,
        reveal: details,
      },
    };
  } catch (err) {
    await log("error", "archive_reveal.failed", { error: err });
    return fail("unavailable");
  }
}
