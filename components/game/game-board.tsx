"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AttemptWithReveal, GameQuestion } from "@/lib/game/types";
import { parseUsdInput } from "@/lib/money";
import { SUBMIT_ERROR_MESSAGES } from "@/lib/errors";
import { submitGuessAction } from "@/app/play/actions";
import { PriceInput } from "@/components/game/price-input";
import { Reveal } from "@/components/game/reveal";
import { ProgressTags } from "@/components/game/progress-tags";
import { QuestionCard } from "@/components/game/question-card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/misc";
import { formatUsd } from "@/lib/money";

export function GameBoard({ initialQuestions }: { initialQuestions: GameQuestion[] }) {
  const router = useRouter();
  const [questions, setQuestions] = useState(initialQuestions);
  const firstOpen = questions.findIndex((q) => !q.attempt);
  const [index, setIndex] = useState(firstOpen === -1 ? questions.length - 1 : firstOpen);
  const [guess, setGuess] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [connectionLost, setConnectionLost] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const revealHeadingRef = useRef<HTMLHeadingElement>(null);

  const current = questions[index];
  const answered = questions.filter((q) => q.attempt).length;
  const total = questions.reduce((s, q) => s + (q.attempt?.score ?? 0), 0);
  const isLast = questions.slice(index + 1).every((q) => q.attempt);

  // When the server re-renders (e.g. after "Check saved progress"), adopt any attempts it
  // knows about that this client missed, without moving the player off the current card.
  const [seenInitial, setSeenInitial] = useState(initialQuestions);
  if (seenInitial !== initialQuestions) {
    setSeenInitial(initialQuestions);
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.attempt) return q;
        const fromServer = initialQuestions.find((i) => i.id === q.id)?.attempt;
        return fromServer ? { ...q, attempt: fromServer } : q;
      }),
    );
    setConnectionLost(false);
  }

  useEffect(() => {
    if (current.attempt) revealHeadingRef.current?.focus();
    else inputRef.current?.focus({ preventScroll: true });
  }, [index, current.attempt]);

  function applyAttempt(questionId: string, attempt: AttemptWithReveal) {
    setQuestions((qs) => qs.map((q) => (q.id === questionId ? { ...q, attempt } : q)));
    setAnnouncement(
      `${attempt.score} of 1,000 points. The correct price was ${formatUsd(attempt.answerSnapshot)}; you guessed ${formatUsd(attempt.guess)}.`,
    );
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const parsed = parseUsdInput(guess);
    if (!parsed.ok) {
      setError(parsed.error);
      inputRef.current?.focus();
      return;
    }
    setError(null);
    setConnectionLost(false);
    const questionId = current.id;
    startTransition(async () => {
      try {
        const res = await submitGuessAction(questionId, parsed.value);
        if (res.ok) {
          applyAttempt(questionId, res.attempt);
          setGuess("");
        } else {
          setError("message" in res ? res.message : SUBMIT_ERROR_MESSAGES[res.error]);
        }
      } catch {
        // The request may have reached the server. Re-read saved progress instead of resubmitting.
        setConnectionLost(true);
      }
    });
  }

  function onContinue() {
    const next = questions.findIndex((q, i) => i > index && !q.attempt);
    const anyOpen = questions.findIndex((q) => !q.attempt);
    if (next !== -1) setIndex(next);
    else if (anyOpen !== -1) setIndex(anyOpen);
    else router.push("/results");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 text-sm text-muted">
        <span>
          Question {index + 1} of 3
        </span>
        <span className="tnum">
          Score <span className="font-semibold text-ink">{total.toLocaleString("en-US")}</span> / 3,000
        </span>
      </div>
      <ProgressTags
        items={questions.map((q, i) => ({
          difficulty: q.difficulty,
          status: q.attempt ? "done" : i === index ? "current" : "upcoming",
          score: q.attempt?.score,
        }))}
      />

      <QuestionCard question={current} />

      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {!current.attempt ? (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <PriceInput
            ref={inputRef}
            id={`guess-${current.id}`}
            label="Your guess"
            value={guess}
            onChange={(v) => {
              setGuess(v);
              if (error) setError(null);
            }}
            error={error}
            disabled={pending}
          />
          {connectionLost && (
            <div role="alert" className="rounded-[10px] border border-amber/30 bg-amber-tint p-3.5 text-sm text-ink-soft">
              <p className="font-semibold text-amber">We lost the connection.</p>
              <p className="mt-1">Your guess may already be saved. Check before trying again — you only get one guess per question.</p>
              <button type="button" onClick={() => router.refresh()} className="mt-2 font-semibold text-green-strong underline">
                Check saved progress
              </button>
            </div>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={pending || guess.trim() === ""}>
            {pending ? (
              <>
                <Spinner /> Locking in…
              </>
            ) : (
              "Submit guess"
            )}
          </Button>
          <p className="text-center text-xs text-muted">One guess per question. It can&apos;t be changed after you submit.</p>
        </form>
      ) : (
        <section aria-labelledby={`reveal-${current.id}`} className="rounded-[16px] border border-line bg-surface p-5 sm:p-6">
          <h2 id={`reveal-${current.id}`} ref={revealHeadingRef} tabIndex={-1} className="sr-only">
            Result for question {index + 1}
          </h2>
          <Reveal attempt={current.attempt} questionId={current.id} />
          <div className="mt-6 border-t border-line pt-5">
            <Button size="lg" className="w-full" onClick={onContinue}>
              {isLast && answered === 3 ? "See your results" : "Next question"}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
