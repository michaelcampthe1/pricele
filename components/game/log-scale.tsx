import { formatUsdCompact } from "@/lib/money";

/**
 * Guess vs. answer on a logarithmic ruler (÷100 … ×100), the same geometry the score uses:
 * equal distances mean equal ratios, so "twice too high" and "half" sit the same distance away.
 */
export function LogScale({ guess, answer }: { guess: string; answer: string }) {
  const ratio = Number(guess) / Number(answer);
  const log = Math.log10(ratio);
  const clamped = Math.max(-2, Math.min(2, log));
  const pos = 50 + clamped * 22.5; // ±2 decades → 5%..95%
  const offScale = Math.abs(log) > 2;
  const ticks = [
    { at: -2, label: "÷100" },
    { at: -1, label: "÷10" },
    { at: 0, label: "Answer" },
    { at: 1, label: "×10" },
    { at: 2, label: "×100" },
  ];
  const describe =
    Math.abs(log) < 0.0005
      ? "Your guess matched the answer."
      : ratio > 1
        ? `Your guess was ${ratio >= 10 ? Math.round(ratio).toLocaleString("en-US") : ratio.toFixed(2)} times the answer.`
        : `Your guess was ${(1 / ratio) >= 10 ? Math.round(1 / ratio).toLocaleString("en-US") : (1 / ratio).toFixed(2)} times lower than the answer.`;

  return (
    <figure className="select-none">
      <div className="relative h-16" role="img" aria-label={describe}>
        {/* track */}
        <div className="absolute inset-x-[5%] top-7 h-1 rounded-full bg-line" />
        <div
          className="absolute top-7 h-1 rounded-full bg-green/30"
          style={{ left: `${Math.min(pos, 50)}%`, width: `${Math.abs(pos - 50)}%` }}
        />
        {ticks.map((t) => (
          <div key={t.at} className="absolute top-5 -translate-x-1/2" style={{ left: `${50 + t.at * 22.5}%` }}>
            <div className={`mx-auto w-px ${t.at === 0 ? "h-5 bg-green" : "h-3 translate-y-1 bg-line-strong"}`} />
            <div className={`mt-1.5 whitespace-nowrap text-[11px] ${t.at === 0 ? "font-semibold text-green-strong" : "text-muted"}`}>
              {t.label}
            </div>
          </div>
        ))}
        {/* guess marker */}
        <div className="marker-slide absolute top-0 -translate-x-1/2" style={{ left: `${pos}%`, ["--from" as string]: "50%" }}>
          <div className="flex flex-col items-center">
            <span className="tnum rounded-md bg-ink px-1.5 py-0.5 text-[11px] font-semibold text-white">
              {offScale ? (log > 0 ? "› " : "‹ ") : ""}
              {formatUsdCompact(guess)}
            </span>
            <span className="h-2 w-0.5 bg-ink" />
            <span className="h-3 w-3 rounded-full border-2 border-surface bg-ink shadow" />
          </div>
        </div>
      </div>
      <figcaption className="sr-only">{describe}</figcaption>
    </figure>
  );
}
