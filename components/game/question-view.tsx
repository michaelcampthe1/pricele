import { DifficultyBadge } from "@/components/ui/difficulty-badge";
import type { PublicQuestion } from "@/lib/game/types";

export function QuestionView({ question, total = 3, headingId }: { question: PublicQuestion; total?: number; headingId?: string }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 pl-6">
        <DifficultyBadge difficulty={question.difficulty} />
        <span className="text-sm text-muted">
          Question {question.position} of {total}
        </span>
      </div>
      <h2 id={headingId} className="text-balance text-[22px] font-semibold leading-snug tracking-[-0.01em] text-ink sm:text-[26px]">
        {question.prompt}
      </h2>
      {question.context ? <p className="text-[15px] leading-relaxed text-ink-soft">{question.context}</p> : null}
      {question.imageUrl ? (
        <figure className="overflow-hidden rounded-[var(--radius)] border border-border bg-surface-muted">
          {/* eslint-disable-next-line @next/next/no-img-element -- admin-provided, licensed image URL */}
          <img src={question.imageUrl} alt={question.imageAlt ?? ""} className="max-h-56 w-full object-cover" loading="lazy" />
          {question.imageCredit ? <figcaption className="px-3 py-1.5 text-xs text-muted">{question.imageCredit}</figcaption> : null}
        </figure>
      ) : null}
    </div>
  );
}
