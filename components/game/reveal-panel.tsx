"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ExternalLink, Info } from "lucide-react";
import { absoluteDifference, formatPercent, formatPoints, formatUsd, formatUsdCompact } from "@/lib/money";
import type { QuestionResult } from "@/lib/game/types";
import { cn } from "@/lib/cn";
import { ComparisonBar } from "./comparison-bar";
import { PointsCounter } from "./points-counter";

function feedback(score: number) {
  if (score === 1000) return "Perfect. Spot on.";
  if (score >= 900) return "Incredibly close.";
  if (score >= 750) return "Great estimate.";
  if (score >= 550) return "Solid — within the right range.";
  if (score >= 350) return "Not bad for a tough one.";
  return "A tricky one. Every price teaches you something.";
}

export function RevealPanel({
  result,
  footer,
  focusOnMount = true,
  animate = true,
}: {
  result: QuestionResult;
  footer?: ReactNode;
  focusOnMount?: boolean;
  animate?: boolean;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus();
  }, [focusOnMount]);

  const { answer, guess, score, percentageError, reveal } = result;
  const big = Number(answer) >= 1_000_000;

  return (
    <section aria-labelledby={`reveal-${result.questionId}`} className={cn("space-y-5", animate && "animate-rise")}>
      {score !== null ? (
        <p className="sr-only" role="status">
          {`${result.voided ? "This question was withdrawn and isn't scored." : `You earned ${score} of 1,000 points.`} The answer was ${formatUsd(answer)}.`}
        </p>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 ref={headingRef} tabIndex={-1} id={`reveal-${result.questionId}`} className="text-sm font-medium uppercase tracking-wide text-muted outline-none">
            {result.mode === "practice" ? "Practice · " : ""}
            {reveal.answerDefinition ?? "Correct price"}
          </h3>
          <p className="tabular mt-1 text-[34px] font-semibold leading-none tracking-[-0.02em] text-ink sm:text-[40px]">{formatUsd(answer)}</p>
          {big ? <p className="tabular mt-1 text-sm text-muted">{formatUsdCompact(answer)}</p> : null}
        </div>
        {score !== null ? (
          <div className={cn("rounded-[var(--radius)] px-4 py-2.5 text-right", result.voided ? "bg-surface-muted" : "bg-accent-soft")}>
            <p className="text-xs font-medium uppercase tracking-wide text-accent-strong">{result.voided ? "Not scored" : "Points"}</p>
            <p className={cn("text-[28px] font-semibold leading-tight", result.voided ? "text-muted line-through" : "text-accent-strong", animate && "animate-pop")}>
              {animate ? <PointsCounter value={score} /> : <span className="tabular">{formatPoints(score)}</span>}
              <span className="text-base font-medium text-accent-strong/70"> / 1,000</span>
            </p>
          </div>
        ) : null}
      </div>

      {guess && score !== null ? (
        <>
          <dl className="tabular grid grid-cols-3 gap-3 rounded-[var(--radius)] border border-border bg-surface-muted/50 p-3 text-sm sm:p-4">
            <div>
              <dt className="text-muted">Your guess</dt>
              <dd className="mt-0.5 font-semibold text-ink break-words">{formatUsd(guess)}</dd>
            </div>
            <div>
              <dt className="text-muted">Difference</dt>
              <dd className="mt-0.5 font-semibold text-ink break-words">{formatUsd(absoluteDifference(guess, answer))}</dd>
            </div>
            <div>
              <dt className="text-muted">Error</dt>
              <dd className="mt-0.5 font-semibold text-ink">{formatPercent(percentageError!)}</dd>
            </div>
          </dl>
          <ComparisonBar guess={guess} answer={answer} />
          {!result.voided ? <p className="text-[15px] font-medium text-ink">{feedback(score)}</p> : null}
        </>
      ) : null}

      {reveal.correctionNote ? (
        <p className="flex gap-2 rounded-[var(--radius)] border border-warning/25 bg-warning-soft px-3 py-2 text-sm text-warning">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-medium">Correction: </span>
            {reveal.correctionNote}
            {result.originalScore !== null && result.originalScore !== score ? ` (Your original score was ${result.originalScore}.)` : ""}
          </span>
        </p>
      ) : null}

      {reveal.explanation ? <p className="text-[15px] leading-relaxed text-ink-soft">{reveal.explanation}</p> : null}
      {(reveal.referenceLabel || reveal.sources.length > 0) && (
        <div className="space-y-1.5 text-sm">
          {reveal.referenceLabel ? <p className="text-muted">{reveal.referenceLabel}</p> : null}
          {reveal.sources.length > 0 ? (
            <ul className="space-y-1">
              {reveal.sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-accent-strong underline decoration-accent/30 underline-offset-2 hover:decoration-accent">
                    Source: {s.publisher} — {s.title}
                    <ExternalLink aria-hidden className="size-3.5" />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
      {footer ? <div className="pt-1">{footer}</div> : null}
    </section>
  );
}
