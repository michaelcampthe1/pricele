import { logScalePosition } from "@/lib/scoring";

/**
 * Guess vs. answer on a log scale spanning answer ÷ 10 to answer × 10 (the answer sits in the
 * middle). Decorative: the same information is given in text next to it.
 */
export function ComparisonBar({ guess, answer }: { guess: string; answer: string }) {
  const g = logScalePosition(guess, answer);
  const clampedLow = g <= 0;
  const clampedHigh = g >= 1;
  return (
    <div aria-hidden className="pt-6">
      <div className="relative h-2 rounded-full bg-surface-muted">
        <div className="absolute inset-y-0 left-1/2 w-px bg-border-strong" />
        <div
          className="absolute inset-y-0 rounded-full bg-accent/25"
          style={{ left: `${Math.min(g, 0.5) * 100}%`, right: `${(1 - Math.max(g, 0.5)) * 100}%` }}
        />
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[11px] font-medium uppercase tracking-wide text-accent-strong">Answer</div>
        <div className="absolute top-1/2 left-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-accent" />
        <div
          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-ink transition-[left] duration-500"
          style={{ left: `${g * 100}%` }}
        />
        <div className="absolute top-4 -translate-x-1/2 text-[11px] font-medium text-ink-soft" style={{ left: `${Math.min(Math.max(g, 0.06), 0.94) * 100}%` }}>
          {clampedLow ? "← You" : clampedHigh ? "You →" : "You"}
        </div>
      </div>
      <div className="mt-6 flex justify-between text-[11px] text-muted">
        <span>÷10</span>
        <span>×10</span>
      </div>
    </div>
  );
}
