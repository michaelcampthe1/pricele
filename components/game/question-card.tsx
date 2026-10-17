import type { PublicQuestion } from "@/lib/game/types";
import { DifficultyLabel } from "@/components/ui/misc";

/** The question itself, presented as a price tag. Contains no answer data. */
export function QuestionCard({ question, practice = false }: { question: PublicQuestion; practice?: boolean }) {
  return (
    <article className="tag pl-10 pr-5 py-5 sm:pl-12 sm:pr-7 sm:py-6" aria-labelledby={`q-${question.id}`}>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <DifficultyLabel difficulty={question.difficulty} />
        <span className="text-sm text-muted">{question.category}</span>
        {practice && <span className="rounded-full bg-sunk px-2 py-0.5 text-xs font-medium text-ink-soft">Practice</span>}
        {question.isSample && (
          <span className="rounded-full bg-amber-tint px-2 py-0.5 text-xs font-medium text-amber">Sample question</span>
        )}
      </div>
      <h2 id={`q-${question.id}`} className="font-display text-[22px] font-semibold leading-snug tracking-[-0.01em] text-ink sm:text-[26px]">
        {question.prompt}
      </h2>
      {question.context && <p className="mt-2.5 text-[15px] leading-relaxed text-muted">{question.context}</p>}
      {question.imageUrl && (
        <figure className="mt-4">
          {/* Admin-provided https image with alt text. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={question.imageUrl}
            alt={question.imageAlt ?? ""}
            loading="lazy"
            className="max-h-56 w-full rounded-[10px] border border-line object-cover"
          />
          {question.imageCredit && <figcaption className="mt-1 text-xs text-muted">{question.imageCredit}</figcaption>}
        </figure>
      )}
    </article>
  );
}
