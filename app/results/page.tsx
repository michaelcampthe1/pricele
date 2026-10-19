import { unstable_rethrow } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Flame, Trophy } from "lucide-react";
import { getViewer } from "@/lib/auth/player";
import { getDailyStanding, getGameState, getStreaks, guestSummary } from "@/lib/game/service";
import { formatGameDate } from "@/lib/dates";
import { formatUsd } from "@/lib/money";
import { formatPercentageError } from "@/lib/scoring";
import { buildShareText } from "@/lib/share";
import { appUrl } from "@/lib/env";
import { DIFFICULTY_LABEL } from "@/lib/game/types";
import { ShareButton } from "@/components/game/share-button";
import { ResetCountdown } from "@/components/game/countdown";
import { GameUnavailable, LoadError } from "@/components/game/unavailable";
import { ButtonLink } from "@/components/ui/button";
import { DifficultyLabel } from "@/components/ui/misc";
import { AdSlot } from "@/components/shared/ad-slot";
import { AnswerContext } from "@/components/game/reveal";
import { logger } from "@/lib/logger";

export const metadata: Metadata = { title: "Your results", robots: { index: false } };

/** Percentile headline, e.g. "Top 15% today". Never shows the raw player count. */
function standingHeadline(r: { rank: number; participants: number }): string {
  if (r.participants === 1) return "First to finish today";
  if (r.rank === 1) return "Top score today";
  const pct = Math.min(100, Math.max(1, Math.ceil((r.rank / r.participants) * 100)));
  return `Top ${pct}% today`;
}

export default async function ResultsPage() {
  let viewer, state;
  try {
    viewer = await getViewer();
    state = await getGameState(viewer.player);
  } catch (err) {
    unstable_rethrow(err);
    logger.error("results.load_failed", { error: String(err) });
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <LoadError what="your results" />
      </div>
    );
  }
  if (!state.available) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <GameUnavailable gameDate={state.gameDate} />
      </div>
    );
  }
  if (!state.questions.every((q) => q.attempt)) redirect("/play");

  const qs = state.questions.map((q) => ({ ...q, attempt: q.attempt! }));
  const total = qs.reduce((s, q) => s + q.attempt.score, 0);
  // Average absolute percentage error across the three questions.
  const avgError = qs.reduce((s, q) => s + Number(q.attempt.percentageError), 0) / 3;
  const medianScoreQ = [...qs].sort((a, b) => b.attempt.score - a.attempt.score)[0];

  const userId = viewer.player.userId;
  const [streaks, rank, claimable] = await Promise.all([
    userId ? getStreaks(userId).catch(() => null) : null,
    getDailyStanding(viewer.player, state.gameDate).catch(() => null),
    !userId && viewer.player.guestHash ? guestSummary(viewer.player.guestHash).catch(() => null) : null,
  ]);

  const shareUrl = userId && viewer.profile?.isPublic ? `${appUrl()}/share/${viewer.profile.username}/${state.gameDate}` : appUrl();
  const shareText = buildShareText({
    gameDate: state.gameDate,
    easy: qs[0].attempt.score,
    medium: qs[1].attempt.score,
    hard: qs[2].attempt.score,
    streak: streaks?.current ?? null,
    url: shareUrl,
  });

  return (
    <div className="mx-auto max-w-2xl px-4 pb-10 pt-8 sm:pt-12">
      <p className="text-sm text-muted">
        <time dateTime={state.gameDate}>{formatGameDate(state.gameDate)}</time>
      </p>
      <h1 className="mt-1 font-display text-3xl font-bold tracking-tight sm:text-4xl">Today&apos;s results</h1>

      <section aria-labelledby="total" className="mt-6 rounded-[16px] border border-line bg-surface p-6 sm:p-8">
        <h2 id="total" className="sr-only">
          Total score
        </h2>
        <p className="tnum font-display text-6xl font-bold tracking-tight text-green-strong sm:text-7xl">
          {total.toLocaleString("en-US")}
          <span className="ml-2 text-2xl font-semibold text-muted">/ 3,000</span>
        </p>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-soft">
          {streaks && (
            <span className="inline-flex items-center gap-1.5">
              <Flame aria-hidden className="h-4 w-4 text-amber" />
              {streaks.current}-day streak
            </span>
          )}
          <span>Average error: {formatPercentageError(avgError.toFixed(6))}</span>
        </div>
        {rank && (
          <div className="mt-5 flex items-center gap-3 rounded-[12px] bg-green-wash px-4 py-3">
            <Trophy aria-hidden className="h-6 w-6 shrink-0 text-green" />
            <div>
              <p className="font-display text-lg font-semibold text-ink">
                {standingHeadline(rank)}
              </p>
              <p className="text-sm text-ink-soft">
                {rank.participants === 1
                  ? "You're the first to finish today. Check back later to see how you compare."
                  : `You scored higher than ${Math.round((rank.beaten / (rank.participants - 1)) * 100)}% of other players.`}
                {!userId && " Create an account to appear on the leaderboard."}
              </p>
            </div>
          </div>
        )}
        <p className="mt-1 text-xs text-muted">Average error is the mean of |guess − answer| ÷ answer across today&apos;s three questions.</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <ShareButton text={shareText} url={shareUrl} />
          <ButtonLink href="/leaderboard" variant="secondary" size="lg">
            View leaderboard
          </ButtonLink>
        </div>
      </section>

      {!userId && (
        <section className="mt-6 rounded-[16px] border border-green/25 bg-green-wash p-5 sm:p-6">
          <h2 className="font-display text-lg font-semibold text-ink">Keep this score</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Create a free account to save {claimable?.attempts ? "today's results" : "your results"}, start a streak, and appear on the
            leaderboard. Your guesses as a guest carry over once you sign in.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <ButtonLink href="/signup?next=/results">Create account</ButtonLink>
            <ButtonLink href="/login?next=/results" variant="secondary">
              Sign in
            </ButtonLink>
          </div>
        </section>
      )}

      <section aria-labelledby="breakdown" className="mt-10">
        <h2 id="breakdown" className="font-display text-xl font-semibold">
          Question by question
        </h2>
        <ol className="mt-4 space-y-3">
          {qs.map((q) => (
            <li key={q.id} className="rounded-[12px] border border-line bg-surface p-4 sm:p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <DifficultyLabel difficulty={q.difficulty} />
                  <p className="mt-1 font-medium text-ink">{q.prompt}</p>
                </div>
                <p className="tnum shrink-0 text-right font-display text-2xl font-semibold text-green-strong">
                  {q.attempt.score}
                  <span className="block text-xs font-normal text-muted">of 1,000</span>
                </p>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div>
                  <dt className="text-muted">Answer</dt>
                  <dd className="tnum font-semibold text-ink break-words">{formatUsd(q.attempt.answerSnapshot)}</dd>
                </div>
                <div>
                  <dt className="text-muted">You said</dt>
                  <dd className="tnum font-semibold text-ink break-words">{formatUsd(q.attempt.guess)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Error</dt>
                  <dd className="tnum font-semibold text-ink">{formatPercentageError(q.attempt.percentageError)}</dd>
                </div>
              </dl>
              <details className="group mt-3">
                <summary className="cursor-pointer text-sm font-medium text-green-strong">
                  Explanation and source <span className="sr-only">for the {DIFFICULTY_LABEL[q.difficulty]} question</span>
                </summary>
                <div className="mt-3">
                  <AnswerContext reveal={q.attempt.reveal} questionId={q.id} />
                </div>
              </details>
            </li>
          ))}
        </ol>
        {medianScoreQ.attempt.score === 1000 && (
          <p className="mt-4 text-sm text-muted">A perfect guess — that&apos;s rare.</p>
        )}
      </section>

      <div className="mt-10 flex flex-col items-center gap-2 text-center text-sm text-muted">
        <ResetCountdown />
        <Link href="/archive" className="font-medium text-green-strong underline underline-offset-2">
          Play past games in the archive
        </Link>
      </div>

      <AdSlot placement="results-footer" />
    </div>
  );
}
