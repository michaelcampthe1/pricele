import { ArrowRight, CircleCheck, CircleDot, Flame, Trophy } from "lucide-react";
import Link from "next/link";
import { formatGameDate } from "@/lib/dates";
import { loadToday } from "@/lib/game/today";
import { getViewer } from "@/lib/auth/session";
import { getPlayerStats } from "@/lib/stats/queries";
import { getLeaderboard } from "@/lib/leaderboard/queries";
import { formatPoints } from "@/lib/money";
import { DIFFICULTY_LABEL } from "@/lib/game/types";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { DifficultyBadge } from "@/components/ui/difficulty-badge";
import { LeaderboardTable } from "@/components/leaderboard/leaderboard-table";
import { AdSlot } from "@/components/shared/ad-slot";
import { ClaimCard } from "@/components/profile/claim-card";
import { ClaimedNotice } from "@/components/profile/claimed-notice";
import { getClaimableGuestProgress } from "@/lib/auth/claimable";
import { cn } from "@/lib/cn";

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const [{ gameDate, set, results, summary }, viewer] = await Promise.all([loadToday(), getViewer()]);
  const [stats, board, claimable] = await Promise.all([
    viewer ? getPlayerStats(viewer.id) : null,
    set ? getLeaderboard("daily", { date: gameDate, limit: 5 }) : null,
    viewer ? getClaimableGuestProgress() : null,
  ]);
  const started = (summary?.answered ?? 0) > 0;
  const cta = !set ? null : summary?.complete ? { href: "/results", label: "View your results" } : started ? { href: "/play", label: "Continue today's game" } : { href: "/play", label: "Play Today's Game" };

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      {sp.claimed !== undefined ? (
        <div className="pt-6">
          <ClaimedNotice claimed={sp.claimed} skipped={sp.skipped} />
        </div>
      ) : null}
      {sp.account === "deleted" ? (
        <div className="pt-6">
          <Alert tone="info" role="status">Your account and its data were deleted.</Alert>
        </div>
      ) : null}
      {claimable ? (
        <div className="pt-6">
          <ClaimCard attempts={claimable.attempts} days={claimable.days} />
        </div>
      ) : null}
      <section className="grid gap-10 py-12 sm:py-16 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-14">
        <div>
          <p className="text-sm font-medium text-accent-strong">
            {formatGameDate(gameDate)} · New game daily at midnight ET
          </p>
          <h1 className="mt-3 text-balance text-[40px] font-semibold leading-[1.05] tracking-[-0.03em] text-ink sm:text-[56px]">
            Think you know what things cost?
          </h1>
          <p className="mt-4 max-w-lg text-lg leading-relaxed text-ink-soft">
            Three questions. Three difficulty levels. One new challenge every day.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {cta ? (
              <ButtonLink href={cta.href} size="lg">
                {cta.label} <ArrowRight aria-hidden className="size-4" />
              </ButtonLink>
            ) : null}
            <ButtonLink href="/archive" size="lg" variant="ghost">
              Explore the Archive
            </ButtonLink>
          </div>
        </div>

        <Card className="p-5 sm:p-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-base font-semibold">Today&apos;s game</h2>
            <p className="tabular text-sm text-muted">
              {summary ? (
                <>
                  <span className="font-semibold text-ink">{formatPoints(summary.total)}</span> / {formatPoints(summary.required * 1000)} pts
                </>
              ) : (
                "3,000 points possible"
              )}
            </p>
          </div>
          {set ? (
            <>
              <ul className="mt-4 space-y-2">
                {set.questions.map((q) => {
                  const r = results.get(q.id);
                  const done = !!r;
                  return (
                    <li key={q.id} className={cn("flex items-center justify-between gap-3 rounded-[var(--radius)] border px-3.5 py-3", done ? "border-accent/25 bg-accent-soft/50" : "border-border")}>
                      <span className="flex items-center gap-3">
                        {done ? <CircleCheck aria-hidden className="size-5 text-accent" /> : <CircleDot aria-hidden className="size-5 text-border-strong" />}
                        <DifficultyBadge difficulty={q.difficulty} />
                      </span>
                      <span className="tabular text-sm">
                        {q.withdrawn ? (
                          <span className="text-muted">Withdrawn</span>
                        ) : done ? (
                          <span className="font-semibold text-accent-strong">{formatPoints(r.score ?? 0)} pts</span>
                        ) : (
                          <span className="text-muted">Not started</span>
                        )}
                        <span className="sr-only"> — {DIFFICULTY_LABEL[q.difficulty]} {done ? "completed" : "not started"}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
                <span>
                  {summary!.answered} of {summary!.required} answered
                </span>
                {stats ? (
                  <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                    <Flame aria-hidden className="size-4 text-accent" /> {stats.current_streak}-day streak
                  </span>
                ) : !viewer ? (
                  <Link href="/signup" className="text-accent-strong underline underline-offset-2">
                    Sign up to track streaks
                  </Link>
                ) : null}
              </div>
            </>
          ) : (
            <p className="mt-4 rounded-[var(--radius)] bg-surface-muted px-4 py-6 text-center text-sm text-muted">
              Today&apos;s questions haven&apos;t been published yet. Check back soon, or play a past game from the archive.
            </p>
          )}
        </Card>
      </section>

      <section aria-labelledby="how" className="grid gap-4 border-t border-border py-12 sm:grid-cols-3">
        <h2 id="how" className="sr-only">How Pricele works</h2>
        {[
          ["Guess the price", "Each question asks for a real price, deal value or cost in US dollars. You get one guess."],
          ["Closer is better", "Up to 1,000 points per question. Being twice or half the answer still earns 591 — it's about orders of magnitude."],
          ["Come back tomorrow", "Finish all three to keep your streak alive. Everyone gets the same game, so compare scores."],
        ].map(([title, body], i) => (
          <div key={title} className="space-y-2">
            <span className="tabular inline-flex size-7 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent-strong">{i + 1}</span>
            <h3 className="font-semibold text-ink">{title}</h3>
            <p className="text-sm leading-relaxed text-muted">{body}</p>
          </div>
        ))}
      </section>

      {set ? (
        <section aria-labelledby="today-board" className="border-t border-border py-12">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 id="today-board" className="flex items-center gap-2 text-lg font-semibold">
              <Trophy aria-hidden className="size-5 text-accent" /> Today&apos;s leaders
            </h2>
            <Link href="/leaderboard" className="text-sm font-medium text-accent-strong hover:underline">
              View all rankings
            </Link>
          </div>
          {board && board.rows.length > 0 ? (
            <Card>
              <LeaderboardTable view="daily" rows={board.rows} compact caption="Top players today" highlight={viewer?.username} />
            </Card>
          ) : (
            <EmptyState title="Be the first to make the leaderboard." action={<ButtonLink href="/play">Play today&apos;s game</ButtonLink>}>
              Nobody has finished today&apos;s game with an account yet.
            </EmptyState>
          )}
        </section>
      ) : null}
      <AdSlot placement="home-secondary" className="mb-4" />
    </div>
  );
}
