"use client";

import { useState, useTransition } from "react";
import { Eye } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { QuestionView } from "@/components/game/question-view";
import { GuessForm } from "@/components/game/guess-form";
import { RevealPanel } from "@/components/game/reveal-panel";
import { revealArchiveAnswer, submitPracticeGuess } from "@/lib/game/actions";
import type { PublicDailySet, QuestionResult } from "@/lib/game/types";

function ArchiveQuestion({ set, index, initial }: { set: PublicDailySet; index: number; initial: QuestionResult | undefined }) {
  const question = set.questions[index];
  const [result, setResult] = useState<QuestionResult | undefined>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [fresh, setFresh] = useState(false);

  async function practice(raw: string) {
    try {
      const res = await submitPracticeGuess({ questionId: question.id, guess: raw });
      if (!res.ok) return res.message;
      setResult(res.result);
      setFresh(true);
      return null;
    } catch {
      return "We couldn't reach Pricele. Check your connection and try again.";
    }
  }

  function reveal() {
    setError(null);
    start(async () => {
      try {
        const res = await revealArchiveAnswer({ questionId: question.id, gameDate: set.gameDate });
        if (!res.ok) setError(res.message);
        else {
          setResult(res.result);
          setFresh(true);
        }
      } catch {
        setError("We couldn't reach Pricele. Try again.");
      }
    });
  }

  return (
    <Card className="tag-notch p-5 sm:p-7">
      <QuestionView question={question} total={set.questions.length} />
      <div className="mt-6 border-t border-border pt-5">
        {question.withdrawn && !result ? (
          <p className="text-sm text-muted">This question was withdrawn{question.correctionNote ? `: ${question.correctionNote}` : "."}</p>
        ) : result ? (
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              {result.mode === "official" ? "Your official result" : result.mode === "practice" ? "Practice result — not counted on leaderboards" : "Answer revealed"}
            </p>
            <RevealPanel result={result} focusOnMount={fresh} animate={fresh} />
          </div>
        ) : (
          <div className="space-y-3">
            <GuessForm onSubmit={practice} label="Practice guess" submitLabel="Check my guess" hint="Practice only — it never affects leaderboards or streaks." />
            {error ? <Alert tone="error">{error}</Alert> : null}
            <Button variant="ghost" size="sm" onClick={reveal} disabled={pending}>
              <Eye aria-hidden className="size-4" /> {pending ? "Loading…" : "Just show me the answer"}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

export function ArchiveClient({ set, initialResults }: { set: PublicDailySet; initialResults: QuestionResult[] }) {
  const byId = new Map(initialResults.map((r) => [r.questionId, r]));
  return (
    <div className="space-y-5">
      {set.questions.map((q, i) => (
        <ArchiveQuestion key={q.id} set={set} index={i} initial={byId.get(q.id)} />
      ))}
    </div>
  );
}
