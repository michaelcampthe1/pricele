"use server";

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { getViewer } from "@/lib/auth/player";
import { issueGuestSession } from "@/lib/auth/guest";
import { parseUsdInput } from "@/lib/money";
import { rateLimit, reportQuestion, revealArchiveAnswer, submitOfficialGuess, submitPracticeGuess } from "@/lib/game/service";
import type { PlayerRef } from "@/lib/game/service";
import type { Reveal, SubmitResult } from "@/lib/game/types";
import { SUBMIT_ERROR_MESSAGES } from "@/lib/errors";
import { clientKey } from "@/lib/request";
import { logger } from "@/lib/logger";

export type GuessActionResult = SubmitResult | { ok: false; error: "server_error" | "invalid_request"; message: string };

const inputSchema = z.object({ questionId: z.uuid(), guess: z.string().max(40) });

function identityKey(p: PlayerRef) {
  return p.userId ? `u:${p.userId}` : p.guestHash ? `g:${p.guestHash.toString("hex").slice(0, 32)}` : null;
}

async function withinLimits(player: PlayerRef, kind: string): Promise<boolean> {
  // Generous limits: a legitimate player sends 3 official guesses a day; retries are idempotent.
  const ip = await clientKey();
  const okIp = await rateLimit(`${kind}:ip:${ip}`, 60, 120);
  const id = identityKey(player);
  const okId = id ? await rateLimit(`${kind}:id:${id}`, 60, 30) : true;
  return okIp && okId;
}

async function submit(kind: "official" | "practice", rawQuestionId: unknown, rawGuess: unknown): Promise<GuessActionResult> {
  const parsed = inputSchema.safeParse({ questionId: rawQuestionId, guess: rawGuess });
  if (!parsed.success) return { ok: false, error: "invalid_request", message: SUBMIT_ERROR_MESSAGES.invalid_request };
  const amount = parseUsdInput(parsed.data.guess);
  if (!amount.ok) return { ok: false, error: "invalid_guess" };

  try {
    const viewer = await getViewer();
    let player = viewer.player;
    const fn = kind === "official" ? submitOfficialGuess : submitPracticeGuess;

    if (!player.userId && !player.guestHash) {
      if (!(await rateLimit(`guest-create:${await clientKey()}`, 3600, 30))) return { ok: false, error: "rate_limited" };
      player = { userId: null, guestHash: await issueGuestSession() };
    }
    if (!(await withinLimits(player, kind))) return { ok: false, error: "rate_limited" };

    let result = await fn(player, parsed.data.questionId, amount.value);
    if (!result.ok && result.error === "guest_expired" && !player.userId) {
      // The cookie outlived its session (expired or already claimed): start a fresh guest session.
      player = { userId: null, guestHash: await issueGuestSession() };
      result = await fn(player, parsed.data.questionId, amount.value);
    }
    if (result.ok) {
      logger.info(`guess.${kind}`, { duplicate: result.duplicate, score: result.attempt.score, user: Boolean(player.userId) });
    }
    return result;
  } catch (err) {
    unstable_rethrow(err);
    logger.error(`guess.${kind}_failed`, { error: String(err) });
    return { ok: false, error: "server_error", message: SUBMIT_ERROR_MESSAGES.server_error };
  }
}

export async function submitGuessAction(questionId: string, guess: string): Promise<GuessActionResult> {
  return submit("official", questionId, guess);
}

export async function submitPracticeAction(questionId: string, guess: string): Promise<GuessActionResult> {
  return submit("practice", questionId, guess);
}

export async function revealArchiveAction(questionId: string): Promise<{ ok: true; reveal: Reveal } | { ok: false; error: string }> {
  if (!z.uuid().safeParse(questionId).success) return { ok: false, error: "invalid_request" };
  try {
    return await revealArchiveAnswer(questionId);
  } catch (err) {
    unstable_rethrow(err);
    logger.error("archive.reveal_failed", { error: String(err) });
    return { ok: false, error: "server_error" };
  }
}

export async function reportQuestionAction(questionId: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const parsed = z.object({ questionId: z.uuid(), message: z.string().trim().min(5).max(1000) }).safeParse({ questionId, message });
  if (!parsed.success) return { ok: false, error: "Describe the problem in at least 5 characters." };
  try {
    const viewer = await getViewer();
    if (!(await rateLimit(`report:${await clientKey()}`, 3600, 10))) return { ok: false, error: "Too many reports. Try again later." };
    const r = await reportQuestion(viewer.player, parsed.data.questionId, parsed.data.message);
    return r.ok ? { ok: true } : { ok: false, error: "Play the question before reporting it." };
  } catch (err) {
    unstable_rethrow(err);
    logger.error("report.failed", { error: String(err) });
    return { ok: false, error: "We couldn't send your report. Try again." };
  }
}
