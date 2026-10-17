import type { PublicQuestion } from "@/lib/game/types";
import { DifficultyLabel } from "@/components/ui/misc";

/** The question itself, presented as a price tag. Contains no answer data. */
export function QuestionCard({ question, practice = false }: { question: PublicQuestion; practice?: boolean }) {
  return (
    <article className={`tag overflow-hidden ${question.imageUrl ? "tag-photo" : ""}`} aria-labelledby={`q-${question.id}`}>
      {question.imageUrl && (
        <figure className="m-0 border-b border-line bg-[#eceee8]">
          {/* Admin-provided picture of the item (https or bundled under /items/), always with alt text. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={question.imageUrl}
            alt={question.imageAlt ?? ""}
            className="mx-auto block aspect-[20/13] max-h-64 w-full max-w-full object-contain"
          />
          {question.imageCredit && <figcaption className="px-4 pb-1.5 text-right text-[11px] text-muted">{question.imageCredit}</figcaption>}
        </figure>
      )}
      <div className="py-5 pl-10 pr-5 sm:py-6 sm:pl-12 sm:pr-7">
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
      </div>
    </article>
  );
}
