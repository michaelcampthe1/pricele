import { cn } from "@/lib/cn";
import { DIFFICULTY_LABEL, type Difficulty } from "@/lib/game/types";

const PIPS: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3 };

/** Difficulty label with 1–3 pips, so meaning never depends on color alone. */
export function DifficultyBadge({ difficulty, className }: { difficulty: Difficulty; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-muted px-2.5 py-1 text-xs font-medium uppercase tracking-wide text-ink-soft",
        className,
      )}
    >
      <span aria-hidden className="flex gap-0.5">
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn("size-1.5 rounded-full", i <= PIPS[difficulty] ? "bg-ink-soft" : "bg-border-strong")}
          />
        ))}
      </span>
      {DIFFICULTY_LABEL[difficulty]}
    </span>
  );
}
