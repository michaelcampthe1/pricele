import type { ProfileStats } from "@/lib/game/types";
import { DIFFICULTY_LABEL } from "@/lib/game/types";
import { formatGameDate } from "@/lib/dates";
import { Stat, EmptyState } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";

const n = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: digits });

export function StatsPanel({ stats, own }: { stats: ProfileStats; own: boolean }) {
  if (stats.gamesCompleted === 0 && stats.questionsAnswered === 0) {
    return (
      <EmptyState
        title={own ? "No games played yet" : "No completed games yet"}
        action={own ? <ButtonLink href="/play">Play today&apos;s game</ButtonLink> : undefined}
      >
        {own ? "Finish today's three questions and your stats start here." : "Stats appear after their first completed daily game."}
      </EmptyState>
    );
  }
  return (
    <div className="space-y-8">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total points" value={n(stats.totalPoints)} />
        <Stat label="Games completed" value={n(stats.gamesCompleted)} />
        <Stat label="Current streak" value={`${stats.currentStreak} ${stats.currentStreak === 1 ? "day" : "days"}`} />
        <Stat label="Best streak" value={`${stats.bestStreak} ${stats.bestStreak === 1 ? "day" : "days"}`} />
        <Stat label="Average daily score" value={n(stats.averageDailyScore)} hint="Out of 3,000" />
        <Stat label="Highest daily score" value={n(stats.highestDailyScore)} />
        <Stat label="Average question score" value={n(stats.averageQuestionScore)} hint="Out of 1,000" />
        <Stat label="Perfect guesses" value={n(stats.perfectGuesses)} />
        <Stat
          label="Median error"
          value={stats.medianPercentageError === null ? "—" : `${n(stats.medianPercentageError, 1)}%`}
          hint="Median of |guess − answer| ÷ answer"
        />
        <Stat label="Questions answered" value={n(stats.questionsAnswered)} />
      </dl>

      <section aria-labelledby="by-difficulty">
        <h2 id="by-difficulty" className="font-display text-lg font-semibold">
          Accuracy by difficulty
        </h2>
        <ul className="mt-3 space-y-2.5">
          {(["easy", "medium", "hard"] as const).map((d) => {
            const v = stats.byDifficulty[d];
            const pct = v ? Math.round((v.averageScore / 1000) * 100) : 0;
            return (
              <li key={d} className="grid grid-cols-[5rem_1fr_6rem] items-center gap-3 text-sm">
                <span className="font-medium">{DIFFICULTY_LABEL[d]}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-sunk" aria-hidden>
                  <span className="block h-full rounded-full bg-green" style={{ width: `${pct}%` }} />
                </span>
                <span className="tnum text-right text-muted">
                  {v ? `${n(v.averageScore)} avg · ${v.answered}` : "No data"}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {stats.recent.length > 0 && (
        <section aria-labelledby="recent">
          <h2 id="recent" className="font-display text-lg font-semibold">
            Recent games
          </h2>
          <div className="mt-3 overflow-x-auto rounded-[12px] border border-line bg-surface">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="text-left text-muted">
                <tr className="border-b border-line">
                  <th scope="col" className="px-4 py-2.5 font-medium">Date</th>
                  <th scope="col" className="px-2 py-2.5 text-right font-medium">Easy</th>
                  <th scope="col" className="px-2 py-2.5 text-right font-medium">Medium</th>
                  <th scope="col" className="px-2 py-2.5 text-right font-medium">Hard</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="tnum">
                {stats.recent.map((r) => (
                  <tr key={r.gameDate} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5">{formatGameDate(r.gameDate, "weekday")}</td>
                    <td className="px-2 py-2.5 text-right">{r.easy}</td>
                    <td className="px-2 py-2.5 text-right">{r.medium}</td>
                    <td className="px-2 py-2.5 text-right">{r.hard}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">{r.total.toLocaleString("en-US")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
