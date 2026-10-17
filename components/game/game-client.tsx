"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { submitOfficialGuess, getTodayProgress } from "@/lib/game/actions";
import type { PublicDailySet, QuestionResult } from "@/lib/game/types";
import { formatPoints } from "@/lib/money";
import { QuestionView } from "./question-view";
import { GuessForm } from "./guess-form";
import { RevealPanel } from "./reveal-panel";
import { ProgressRail } from "./progress-rail";

export function GameClient({ set, initialResults }: { set: PublicDailySet; initialResults: QuestionResult[] }) {
  const router = useRouter();
  const [results, setResults] = useState<Record<string, QuestionResult>>(() =>
    Object.fromEntries(initialResults.map((r) => [r.questionId, r])),
  );
  // The question whose answer is currently being shown (after submitting, before Continue).
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const playable = set.questions.filter((q) => !q.withdrawn);
  const nextQuestion = playable.find((q) => !results[q.id]) ?? null;
  const current = revealingId ? set.questions.find((q) => q.id === revealingId)! : nextQuestion;
  const total = useMemo(
    () => Object.values(results).reduce((sum, r) => sum + (r.voided || r.score === null ? 0 : r.score), 0),
    [results],
  );
  const finished = !nextQuestion;

  async function submit(questionId: string, raw: string): Promise<string | null> {
    setNotice(null);
    try {
      const res = await submitOfficialGuess({ questionId, guess: raw });
      if (!res.ok) {
        if (res.error === "question_not_current") router.refresh();
        return res.message;
      }
      setResults((prev) => ({ ...prev, [questionId]: res.result }));
      setRevealingId(questionId);
      if (res.alreadySubmitted) setNotice("You'd already answered this question, so your original guess stands.");
      return null;
    } catch {
      // The request may have been saved even though the response was lost. Re-read progress
      // instead of resubmitting blindly; resubmitting would be harmless (idempotent) anyway.
      try {
        const progress = await getTodayProgress();
        const saved = progress.ok ? progress.results.find((r) => r.questionId === questionId) : undefined;
        if (saved) {
          setResults((prev) => ({ ...prev, [questionId]: saved }));
          setRevealingId(questionId);
          return null;
        }
      } catch {
        /* fall through */
      }
      return "We couldn't reach Pricele. Your guess wasn't recorded — check your connection and try again.";
    }
  }

  if (!current) {
    return (
      <Card className="p-6 text-center sm:p-10">
        <Trophy aria-hidden className="mx-auto size-8 text-accent" />
        <h2 className="mt-3 text-2xl font-semibold">You&apos;ve finished today&apos;s game</h2>
        <p className="tabular mt-1 text-muted">{formatPoints(total)} / {formatPoints(playable.length * 1000)} points</p>
        <Button className="mt-6" size="lg" onClick={() => router.push("/results")}>
          See your results <ArrowRight aria-hidden className="size-4" />
        </Button>
      </Card>
    );
  }

  const revealed = revealingId ? results[revealingId] : null;
  const isLast = revealed && finished;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Score <span className="tabular font-semibold text-ink">{formatPoints(total)}</span>
          <span className="tabular"> / {formatPoints(playable.length * 1000)}</span>
        </p>
      </div>
      <ProgressRail questions={set.questions} results={results} activeId={current.id} />

      <Card key={current.id} className="tag-notch animate-rise p-5 sm:p-8">
        <QuestionView question={current} total={set.questions.length} headingId="question-heading" />
        <div className="mt-6 border-t border-border pt-6">
          {revealed ? (
            <RevealPanel
              result={revealed}
              footer={
                <div className="space-y-3">
                  {notice ? <Alert tone="info">{notice}</Alert> : null}
                  {isLast ? (
                    <Button size="lg" className="w-full sm:w-auto" onClick={() => router.push("/results")}>
                      See your results <ArrowRight aria-hidden className="size-4" />
                    </Button>
                  ) : (
                    <Button size="lg" className="w-full sm:w-auto" onClick={() => setRevealingId(null)}>
                      Next question <ArrowRight aria-hidden className="size-4" />
                    </Button>
                  )}
                </div>
              }
            />
          ) : (
            <GuessForm onSubmit={(raw) => submit(current.id, raw)} />
          )}
        </div>
      </Card>
    </div>
  );
}
