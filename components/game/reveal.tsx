"use client";

import { useState } from "react";
import { ExternalLink, Flag } from "lucide-react";
import type { AttemptWithReveal, Reveal as RevealData } from "@/lib/game/types";
import { formatDifference, formatUsd } from "@/lib/money";
import { formatPercentageError } from "@/lib/scoring";
import { formatGameDate } from "@/lib/dates";
import { LogScale } from "@/components/game/log-scale";
import { CountUp } from "@/components/game/count-up";
import { reportQuestionAction } from "@/app/play/actions";

export function feedbackFor(score: number): string {
  if (score === 1000) return "Spot on.";
  if (score >= 850) return "Extremely close.";
  if (score >= 700) return "Close call.";
  if (score >= 550) return "Same ballpark.";
  if (score >= 400) return "Tricky one.";
  return "That one surprises most people.";
}

/** The answer card shown after an official or practice submission. */
export function Reveal({
  attempt,
  animate = true,
  practice = false,
  questionId,
}: {
  attempt: AttemptWithReveal;
  animate?: boolean;
  practice?: boolean;
  questionId?: string;
}) {
  const r = attempt.reveal;
  const corrected = r.corrections.length > 0;
  return (
    <div className={`space-y-6 ${animate ? "reveal-in" : ""}`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{practice ? "Practice score" : "Points earned"}</p>
          <p className="font-display text-5xl font-bold tracking-tight text-green-strong">
            {animate ? <CountUp value={attempt.score} /> : <span className="tnum">{attempt.score.toLocaleString("en-US")}</span>}
            <span className="ml-1 text-xl font-semibold text-muted">/ 1,000</span>
          </p>
        </div>
        <p className="text-base font-medium text-ink-soft">{feedbackFor(attempt.score)}</p>
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[12px] border border-line bg-line">
        <div className="bg-surface p-3.5">
          <dt className="text-xs text-muted">Correct price</dt>
          <dd className="tnum mt-0.5 break-words font-display text-lg font-semibold text-ink">{formatUsd(attempt.answerSnapshot)}</dd>
        </div>
        <div className="bg-surface p-3.5">
          <dt className="text-xs text-muted">Your guess</dt>
          <dd className="tnum mt-0.5 break-words font-display text-lg font-semibold text-ink">{formatUsd(attempt.guess)}</dd>
        </div>
        <div className="bg-surface p-3.5">
          <dt className="text-xs text-muted">Difference</dt>
          <dd className="tnum mt-0.5 break-words text-base font-medium text-ink-soft">{formatDifference(attempt.guess, attempt.answerSnapshot)}</dd>
        </div>
        <div className="bg-surface p-3.5">
          <dt className="text-xs text-muted">Error</dt>
          <dd className="tnum mt-0.5 text-base font-medium text-ink-soft">{formatPercentageError(attempt.percentageError)}</dd>
        </div>
      </dl>

      <LogScale guess={attempt.guess} answer={attempt.answerSnapshot} />

      <AnswerContext reveal={r} questionId={questionId} />

      {corrected && (
        <div className="rounded-[10px] border border-amber/25 bg-amber-tint p-3.5 text-sm text-ink-soft">
          <p className="font-semibold text-amber">This answer was corrected</p>
          {r.corrections.map((c) => (
            <p key={c.correctedAt} className="mt-1">
              Changed from {formatUsd(c.oldAnswer)} to {formatUsd(c.newAnswer)}: {c.reason}{" "}
              <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
                Source
              </a>
              . Every player&apos;s score for this question was recalculated the same way.
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export function AnswerContext({ reveal, questionId }: { reveal: RevealData; questionId?: string }) {
  const when = reveal.referencePeriod ?? (reveal.referenceDate ? formatGameDate(reveal.referenceDate, "long").replace(/^\w+, /, "") : null);
  return (
    <div className="space-y-3 text-[15px] leading-relaxed">
      <p className="text-sm text-muted">
        <span className="font-medium text-ink-soft">{reveal.answerDefinition}</span>
        {when && <>, {when}</>}
      </p>
      {reveal.explanation && <p className="text-ink-soft">{reveal.explanation}</p>}
      {reveal.sources.length > 0 && (
        <ul className="space-y-1.5">
          {reveal.sources.map((s) => (
            <li key={s.url + s.title}>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-start gap-1.5 text-sm font-medium text-green-strong underline decoration-green/30 underline-offset-2 hover:decoration-green"
              >
                <ExternalLink aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {s.title} <span className="font-normal text-muted">— {s.publisher}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {questionId && <ReportProblem questionId={questionId} />}
    </div>
  );
}

export function ReportProblem({ questionId }: { questionId: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  if (status?.ok) return <p className="text-sm text-muted" role="status">{status.text}</p>;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <Flag aria-hidden className="h-3.5 w-3.5" /> Report a problem with this answer
      </button>
    );
  }
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        const r = await reportQuestionAction(questionId, message);
        setPending(false);
        setStatus(r.ok ? { ok: true, text: "Thanks — an editor will review this answer." } : { ok: false, text: r.error ?? "Couldn't send." });
      }}
    >
      <label htmlFor={`report-${questionId}`} className="block text-sm font-medium text-ink">
        What looks wrong?
      </label>
      <textarea
        id={`report-${questionId}`}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={1000}
        rows={3}
        className="block w-full rounded-[10px] border border-line-strong bg-surface p-2.5 text-sm focus:border-green focus:outline-none"
        placeholder="Include a source if you have one."
      />
      {status && !status.ok && <p className="text-sm text-red">{status.text}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending || message.trim().length < 5} className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {pending ? "Sending…" : "Send report"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md px-3 py-1.5 text-sm text-muted hover:text-ink">
          Cancel
        </button>
      </div>
    </form>
  );
}
