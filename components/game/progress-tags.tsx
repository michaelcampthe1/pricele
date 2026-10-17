import { Check } from "lucide-react";
import type { Difficulty } from "@/lib/game/types";
import { DIFFICULTY_LABEL } from "@/lib/game/types";

export type TagStatus = "done" | "current" | "upcoming";

/** Three-step progress: each step names its difficulty, state and (when done) points. */
export function ProgressTags({
  items,
}: {
  items: { difficulty: Difficulty; status: TagStatus; score?: number | null }[];
}) {
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="Game progress">
      {items.map((it, i) => (
        <li
          key={it.difficulty}
          aria-current={it.status === "current" ? "step" : undefined}
          className={`flex min-w-0 items-center gap-2 rounded-[10px] border px-2.5 py-2 text-sm ${
            it.status === "current"
              ? "border-ink bg-surface text-ink"
              : it.status === "done"
                ? "border-green/30 bg-green-wash text-green-strong"
                : "border-line bg-transparent text-muted"
          }`}
        >
          <span
            aria-hidden
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
              it.status === "done" ? "bg-green text-white" : it.status === "current" ? "bg-ink text-white" : "bg-line text-muted"
            }`}
          >
            {it.status === "done" ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
          </span>
          <span className="truncate font-medium">{DIFFICULTY_LABEL[it.difficulty]}</span>
          {it.status === "done" && typeof it.score === "number" && (
            <span className="tnum ml-auto hidden text-xs font-semibold sm:inline">{it.score}</span>
          )}
          <span className="sr-only">
            {it.status === "done" ? `, completed${typeof it.score === "number" ? `, ${it.score} points` : ""}` : it.status === "current" ? ", current question" : ", not started"}
          </span>
        </li>
      ))}
    </ol>
  );
}
