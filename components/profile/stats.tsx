import Link from "next/link";
import { Flame, Target, Trophy, Zap } from "lucide-react";
import type { PlayerStats } from "@/lib/stats/queries";
import { formatGameDate } from "@/lib/dates";
import { formatPercent, formatPoints } from "@/lib/money";
import { DIFFICULTIES, DIFFICULTY_LABEL } from "@/lib/game/types";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";

function Stat({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius)] border border-border bg-surface p-4">
      <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
        {icon}
        {label}
      </dt>
      <dd className="tabular mt-1.5 text-2xl font-semibold text-ink">{value}</dd>
    </div>
  );
}

const dash = <span className="text-muted">—</span>;

export function StatsPanel({ stats, isSelf }: { stats: PlayerStats; isSelf: boolean }) {
  if (stats.questions_answered === 0) {
    return (
      <EmptyState title={isSelf ? "No official games yet" : "No games yet"} action={isSelf ? <ButtonLink href="/play">Play today&apos;s game</ButtonLink> : null}>
        {isSelf ? "Statistics appear here after you play your first official daily game." : "This player hasn't completed any official games yet."}
      </EmptyState>
    );
  }
  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Current streak" icon={<Flame aria-hidden className="size-3.5 text-accent" />} value={`${stats.current_streak} ${stats.current_streak === 1 ? "day" : "days"}`} />
        <Stat label="Best streak" value={`${stats.best_streak} ${stats.best_streak === 1 ? "day" : "days"}`} />
        <Stat label="Total points" icon={<Trophy aria-hidden className="size-3.5 text-accent" />} value={formatPoints(stats.total_points)} />
        <Stat label="Games completed" value={stats.games_completed} />
        <Stat label="Average daily" value={stats.average_daily_score === null ? dash : formatPoints(Math.round(stats.average_daily_score))} />
        <Stat label="Best daily" value={stats.highest_daily_score === null ? dash : formatPoints(stats.highest_daily_score)} />
        <Stat label="Perfect guesses" icon={<Target aria-hidden className="size-3.5 text-accent" />} value={stats.perfect_guesses} />
        <Stat label="Avg question" icon={<Zap aria-hidden className="size-3.5 text-accent" />} value={stats.average_question_score === null ? dash : formatPoints(Math.round(stats.average_question_score))} />
      </dl>
      <p className="text-xs text-muted">
        Totals count completed official daily games. Questions answered: {stats.questions_answered}. Median error{" "}
        {stats.median_absolute_percentage_error === null ? "—" : formatPercent(stats.median_absolute_percentage_error)}, mean error{" "}
        {stats.mean_absolute_percentage_error === null ? "—" : formatPercent(stats.mean_absolute_percentage_error)} (absolute percentage error, |guess − answer| ÷ answer, across all official guesses).
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h3 className="font-semibold">Accuracy by difficulty</h3>
          <p className="text-xs text-muted">Average points per question</p>
          <ul className="mt-4 space-y-3">
            {DIFFICULTIES.map((d) => {
              const row = stats.by_difficulty[d];
              const avg = row ? Number(row.average_score) : null;
              return (
                <li key={d}>
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{DIFFICULTY_LABEL[d]}</span>
                    <span className="tabular text-ink-soft">
                      {avg === null ? "No answers yet" : `${formatPoints(Math.round(avg))} pts · ${row!.answered} answered`}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 rounded-full bg-surface-muted" aria-hidden>
                    <div className="h-2 rounded-full bg-accent" style={{ width: `${((avg ?? 0) / 1000) * 100}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card className="p-5">
          <h3 className="font-semibold">Recent results</h3>
          {stats.recent_results.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No completed games yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {stats.recent_results.map((r) => (
                <li key={r.game_date} className="tabular flex items-center justify-between py-2 text-sm">
                  <Link href={`/archive/${r.game_date}`} className="text-ink-soft hover:text-ink hover:underline">
                    {formatGameDate(r.game_date, "medium")}
                  </Link>
                  <span>
                    <span className="mr-3 text-xs text-muted">
                      {r.easy_score} · {r.medium_score} · {r.hard_score}
                    </span>
                    <span className="font-semibold">{formatPoints(r.total_score)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
