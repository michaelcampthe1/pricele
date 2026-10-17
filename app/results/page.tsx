import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Archive, Flame, Medal, Trophy } from "lucide-react";
import Decimal from "decimal.js";
import { loadToday } from "@/lib/game/today";
import { formatGameDate } from "@/lib/dates";
import { formatPercent, formatPoints, formatUsd } from "@/lib/money";
import { getViewer } from "@/lib/auth/session";
import { getLeaderboard } from "@/lib/leaderboard/queries";
import { getPlayerStats } from "@/lib/stats/queries";
import { getClaimableGuestProgress } from "@/lib/auth/claimable";
import { buildShareText } from "@/lib/share";
import { publicEnv } from "@/lib/env";
import { DIFFICULTY_LABEL } from "@/lib/game/types";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { DifficultyBadge } from "@/components/ui/difficulty-badge";
import { ShareButton } from "@/components/game/share-button";
import { GameUnavailable, SampleBanner } from "@/components/game/unavailable";
import { ClaimCard } from "@/components/profile/claim-card";
import { ClaimedNotice } from "@/components/profile/claimed-notice";
import { AdSlot } from "@/components/shared/ad-slot";

export const metadata: Metadata = { title: "Your results", robots: { index: false } };

export default async function ResultsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { gameDate, set, results, summary } = await loadToday();
  if (!set) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <GameUnavailable />
      </div>
    );
  }
  const viewer = await getViewer();
  if (!summary!.complete) {
    // A player who just signed up still has today's game on their guest session: offer to
    // save it rather than sending them back to an empty game.
    const pending = viewer ? await getClaimableGuestProgress() : null;
    if (!pending) redirect("/play");
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-12 sm:px-6">
        <h1 className="text-2xl font-semibold">Welcome, {viewer!.username}</h1>
        <p className="text-muted">Save the games you played as a guest on this device to your new account.</p>
        <ClaimCard attempts={pending.attempts} days={pending.days} />
      </div>
    );
  }

  const [rank, stats, claimable] = await Promise.all([
    viewer ? getLeaderboard("daily", { date: gameDate, username: viewer.username, limit: 1 }) : null,
    viewer ? getPlayerStats(viewer.id) : null,
    viewer ? getClaimableGuestProgress() : null,
  ]);
  const myRank = rank?.rows[0];
  const totalPlayers = myRank ? (await getLeaderboard("daily", { date: gameDate, limit: 1 })).totalCount : 0;

  const scored = [...results.values()].filter((r) => !r.voided && r.percentageError !== null);
  const avgError = scored.length
    ? scored.reduce((acc, r) => acc.plus(r.percentageError!), new Decimal(0)).dividedBy(scored.length).toString()
    : null;
  const max = summary!.required * 1000;
  const env = publicEnv();
  const shareUrl = viewer?.isPublic ? `${env.appUrl}/share/${viewer.username}/${gameDate}` : env.appUrl;
  const shareText = buildShareText({
    gameDate,
    scores: { easy: summary!.byPosition[1], medium: summary!.byPosition[2], hard: summary!.byPosition[3] },
    total: summary!.total,
    max,
    streak: stats?.current_streak,
    url: shareUrl,
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6 sm:py-12">
      <ClaimedNotice claimed={sp.claimed} skipped={sp.skipped} />
      {set.isSample ? <SampleBanner /> : null}
      {claimable ? <ClaimCard attempts={claimable.attempts} days={claimable.days} /> : null}

      <Card className="overflow-hidden">
        <div className="border-b border-border bg-accent-soft/50 px-5 py-6 text-center sm:px-8 sm:py-8">
          <p className="text-sm font-medium text-accent-strong">{formatGameDate(gameDate)}</p>
          <h1 className="sr-only">Your results</h1>
          <p className="tabular mt-2 text-6xl font-semibold tracking-[-0.03em] text-ink sm:text-7xl">{formatPoints(summary!.total)}</p>
          <p className="tabular mt-1 text-muted">out of {formatPoints(max)} points</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2 text-sm">
            {viewer && stats ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 font-medium text-ink">
                <Flame aria-hidden className="size-4 text-accent" />
                {stats.current_streak}-day streak
              </span>
            ) : null}
            {myRank ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 font-medium text-ink">
                <Medal aria-hidden className="size-4 text-accent" />
                #{myRank.rank} of {totalPlayers} today
              </span>
            ) : null}
            {avgError ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-ink-soft">
                Average error {formatPercent(avgError)}
              </span>
            ) : null}
          </div>
        </div>

        <ul className="divide-y divide-border">
          {set.questions.map((q) => {
            const r = results.get(q.id);
            return (
              <li key={q.id} className="grid gap-2 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center sm:px-8">
                <div className="min-w-0 space-y-1.5">
                  <DifficultyBadge difficulty={q.difficulty} />
                  <p className="text-[15px] text-ink">{q.prompt}</p>
                  {r ? (
                    <p className="tabular text-sm text-muted">
                      You guessed <span className="font-medium text-ink">{formatUsd(r.guess!)}</span> · Answer{" "}
                      <span className="font-medium text-ink">{formatUsd(r.answer)}</span>
                    </p>
                  ) : (
                    <p className="text-sm text-muted">Withdrawn — not scored.</p>
                  )}
                </div>
                <p className="tabular text-right text-xl font-semibold text-accent-strong sm:min-w-24">
                  {r && !r.voided ? formatPoints(r.score!) : "—"}
                  <span className="sr-only"> points for {DIFFICULTY_LABEL[q.difficulty]}</span>
                </p>
              </li>
            );
          })}
        </ul>
        <p className="border-t border-border px-5 py-3 text-xs text-muted sm:px-8">
          Average error is the mean of your absolute percentage errors (|guess − answer| ÷ answer) across today&apos;s scored questions.
        </p>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <ShareButton text={shareText} url={shareUrl} />
        <div className="flex gap-2">
          <ButtonLink href="/leaderboard" variant="secondary" size="lg">
            <Trophy aria-hidden className="size-4" /> Leaderboard
          </ButtonLink>
          <ButtonLink href="/archive" variant="secondary" size="lg">
            <Archive aria-hidden className="size-4" /> Archive
          </ButtonLink>
        </div>
      </div>

      {!viewer ? (
        <Card className="p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Save this score and join the leaderboard</h2>
          <p className="mt-1 text-sm text-muted">
            You played as a guest. Create a free account to keep today&apos;s result, build a streak and compete with other players.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <ButtonLink href="/signup?next=/results">Create account</ButtonLink>
            <ButtonLink href="/login?next=/results" variant="secondary">
              Sign in
            </ButtonLink>
          </div>
        </Card>
      ) : viewer && !viewer.usernameConfirmed ? (
        <p className="text-sm text-muted">
          You appear on leaderboards as <span className="font-medium text-ink">{viewer.username}</span>.{" "}
          <Link href="/profile#settings" className="text-accent-strong underline underline-offset-2">Choose a username</Link>
        </p>
      ) : null}

      <p className="text-center text-sm text-muted">A new game unlocks at midnight Eastern Time.</p>
      <AdSlot placement="results-footer" />
    </div>
  );
}
