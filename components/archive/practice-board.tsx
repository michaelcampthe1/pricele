"use client";

import { useState, useTransition } from "react";
import type { ArchiveQuestion, AttemptWithReveal, Reveal as RevealData } from "@/lib/game/types";
import { parseUsdInput, formatUsd } from "@/lib/money";
import { SUBMIT_ERROR_MESSAGES } from "@/lib/errors";
import { revealArchiveAction, submitPracticeAction } from "@/app/play/actions";
import { QuestionCard } from "@/components/game/question-card";
import { PriceInput } from "@/components/game/price-input";
import { AnswerContext, Reveal } from "@/components/game/reveal";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/misc";

export function PracticeBoard({ questions }: { questions: ArchiveQuestion[] }) {
  return (
    <ol className="space-y-10">
      {questions.map((q) => (
        <li key={q.id}>
          <PracticeQuestion q={q} />
        </li>
      ))}
    </ol>
  );
}

function PracticeQuestion({ q }: { q: ArchiveQuestion }) {
  const [practice, setPractice] = useState<AttemptWithReveal | null>(
    q.practice && q.reveal ? { ...q.practice, reveal: q.reveal } : null,
  );
  const [revealed, setRevealed] = useState<RevealData | null>(null);
  const [guess, setGuess] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [announce, setAnnounce] = useState("");

  const official = q.official && q.reveal ? { ...q.official, reveal: q.reveal } : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseUsdInput(guess);
    if (!parsed.ok) return setError(parsed.error);
    setError(null);
    start(async () => {
      try {
        const r = await submitPracticeAction(q.id, parsed.value);
        if (r.ok) {
          setPractice(r.attempt);
          setAnnounce(`Practice score ${r.attempt.score} of 1,000. The answer was ${formatUsd(r.attempt.answerSnapshot)}.`);
        } else setError("message" in r ? r.message : SUBMIT_ERROR_MESSAGES[r.error]);
      } catch {
        setError(SUBMIT_ERROR_MESSAGES.server_error);
      }
    });
  }

  function showAnswer() {
    start(async () => {
      const r = await revealArchiveAction(q.id);
      if (r.ok) setRevealed(r.reveal);
      else setError("We couldn't load the answer. Try again.");
    });
  }

  return (
    <div className="space-y-4">
      <QuestionCard question={q} practice={!official} />
      <div aria-live="polite" className="sr-only">
        {announce}
      </div>
      {official ? (
        <div className="rounded-[16px] border border-line bg-surface p-5">
          <p className="mb-4 text-sm font-medium text-ink-soft">Your official result from that day</p>
          <Reveal attempt={official} animate={false} questionId={q.id} />
        </div>
      ) : practice ? (
        <div className="rounded-[16px] border border-line bg-surface p-5">
          <Reveal attempt={practice} practice questionId={q.id} />
        </div>
      ) : revealed ? (
        <div className="rounded-[16px] border border-line bg-surface p-5">
          <p className="text-sm text-muted">Correct price</p>
          <p className="tnum font-display text-3xl font-bold text-ink">{formatUsd(revealed.answer)}</p>
          <div className="mt-4">
            <AnswerContext reveal={revealed} questionId={q.id} />
          </div>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-3">
          <PriceInput
            id={`practice-${q.id}`}
            label="Your practice guess"
            value={guess}
            onChange={(v) => {
              setGuess(v);
              setError(null);
            }}
            error={error}
            disabled={pending}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending || !guess.trim()}>
              {pending && <Spinner />} Check my guess
            </Button>
            <Button type="button" variant="ghost" onClick={showAnswer} disabled={pending}>
              Just show the answer
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
