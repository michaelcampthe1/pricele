import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/cn";
import { DIFFICULTY_LABEL, type PublicQuestion, type QuestionResult } from "@/lib/game/types";
import { formatPoints } from "@/lib/money";

/** Three-step progress indicator. Status is conveyed by text and icons, not color alone. */
export function ProgressRail({
  questions,
  results,
  activeId,
}: {
  questions: PublicQuestion[];
  results: Record<string, QuestionResult>;
  activeId: string | null;
}) {
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="Today's questions">
      {questions.map((q) => {
        const r = results[q.id];
        const active = q.id === activeId;
        const status = q.withdrawn ? "withdrawn" : r ? "answered" : active ? "current" : "upcoming";
        return (
          <li
            key={q.id}
            aria-current={active ? "step" : undefined}
            className={cn(
              "rounded-[var(--radius)] border px-3 py-2 text-left transition-colors",
              status === "answered" && "border-accent/30 bg-accent-soft/60",
              status === "current" && "border-ink-soft bg-surface",
              status === "upcoming" && "border-border bg-surface/60",
              status === "withdrawn" && "border-border bg-surface-muted",
            )}
          >
            <span className="flex items-center justify-between gap-1 text-xs font-medium uppercase tracking-wide text-muted">
              {DIFFICULTY_LABEL[q.difficulty]}
              {status === "answered" ? <Check aria-hidden className="size-3.5 text-accent-strong" /> : null}
              {status === "withdrawn" ? <Minus aria-hidden className="size-3.5" /> : null}
            </span>
            <span className="tabular mt-0.5 block text-sm font-semibold text-ink">
              {status === "answered" && r.score !== null ? `${formatPoints(r.score)} pts` : status === "current" ? "Now" : status === "withdrawn" ? "Withdrawn" : "—"}
            </span>
            <span className="sr-only">{status === "answered" ? "answered" : status === "current" ? "current question" : status === "withdrawn" ? "withdrawn, not scored" : "not started"}</span>
          </li>
        );
      })}
    </ol>
  );
}
