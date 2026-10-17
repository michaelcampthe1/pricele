import { unstable_rethrow } from "next/navigation";
import Link from "next/link";
import { Flame } from "lucide-react";
import { getViewer } from "@/lib/auth/player";
import { getDailyLeaderboard, getGameState, getStreaks } from "@/lib/game/service";
import type { GameState, LeaderboardRow } from "@/lib/game/types";
import { formatGameDate, gameDateFor } from "@/lib/dates";
import { ButtonLink } from "@/components/ui/button";
import { DifficultyLabel, Avatar } from "@/components/ui/misc";
import { ResetCountdown } from "@/components/game/countdown";
import { AdSlot } from "@/components/shared/ad-slot";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let state: GameState | null = null;
  let streak: number | null = null;
  let board: LeaderboardRow[] = [];
  let signedIn = false;
  try {
    const viewer = await getViewer();
    signedIn = Boolean(viewer.player.userId);
    state = await getGameState(viewer.player);
    const [s, b] = await Promise.all([
      viewer.player.userId ? getStreaks(viewer.player.userId) : null,
      state.available ? getDailyLeaderboard(state.gameDate, 5) : [],
    ]);
    streak = s?.current ?? null;
    board = b;
  } catch (err) {
    unstable_rethrow(err);
    logger.error("home.load_failed", { error: String(err) });
  }

  const gameDate = state?.gameDate ?? gameDateFor();
  const questions = state?.available ? state.questions : null;
  const answered = questions?.filter((q) => q.attempt).length ?? 0;
  const score = questions?.reduce((s, q) => s + (q.attempt?.score ?? 0), 0) ?? 0;
  const done = answered === 3;

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <section className="grid gap-10 pb-14 pt-10 sm:pt-16 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-16">
        <div>
          <p className="text-sm text-muted">
            <time dateTime={gameDate}>{formatGameDate(gameDate)}</time> · <ResetCountdown prefix="New game in" />
          </p>
          <h1 className="mt-4 max-w-[12ch] font-display text-[44px] font-bold leading-[1.02] tracking-[-0.035em] text-ink sm:text-6xl lg:text-7xl">
            Think you know what things cost?
          </h1>
          <p className="mt-5 max-w-md text-lg text-ink-soft">
            Three questions. Three difficulty levels. One new challenge every day.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ButtonLink href={done ? "/results" : "/play"} size="lg">
              {done ? "See today's results" : answered > 0 ? "Continue today's game" : "Play today's game"}
            </ButtonLink>
            <ButtonLink href="/archive" variant="ghost" size="lg">
              Explore the archive
            </ButtonLink>
          </div>
          {(answered > 0 || (streak ?? 0) > 0) && (
            <dl className="mt-8 flex flex-wrap gap-x-8 gap-y-3 text-sm">
              <div>
                <dt className="text-muted">Today</dt>
                <dd className="tnum font-display text-xl font-semibold text-ink">
                  {answered}/3 answered · {score.toLocaleString("en-US")} pts
                </dd>
              </div>
              {signedIn && (
                <div>
                  <dt className="text-muted">Streak</dt>
                  <dd className="tnum inline-flex items-center gap-1 font-display text-xl font-semibold text-ink">
                    <Flame aria-hidden className="h-4 w-4 text-amber" /> {streak ?? 0} {streak === 1 ? "day" : "days"}
                  </dd>
                </div>
              )}
            </dl>
          )}
        </div>

        <div aria-label="Today's questions" role="region">
          <ol className="space-y-3">
            {(questions ?? (["easy", "medium", "hard"] as const).map((d) => ({ difficulty: d, attempt: null, id: d }))).map((q, i) => {
              const status = !questions ? "Unavailable" : q.attempt ? "Completed" : i === answered ? "Up next" : "Not started";
              return (
                <li key={q.id} className="tag flex items-center justify-between gap-4 py-5 pl-11 pr-5 sm:pl-12">
                  <div>
                    <DifficultyLabel difficulty={q.difficulty} />
                    <p className="mt-1 text-sm text-muted">Question {i + 1}</p>
                  </div>
                  <div className="text-right">
                    {q.attempt ? (
                      <p className="tnum font-display text-2xl font-semibold text-green-strong">
                        {q.attempt.score}
                        <span className="text-sm font-normal text-muted"> / 1,000</span>
                      </p>
                    ) : (
                      <p className="tnum font-display text-2xl font-semibold text-line-strong">— / 1,000</p>
                    )}
                    <p className={`text-xs ${q.attempt ? "text-green-strong" : "text-muted"}`}>{status}</p>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-right text-sm text-muted">Up to 3,000 points</p>
          {state && !state.available && (
            <p className="mt-3 rounded-[10px] bg-amber-tint p-3 text-sm text-amber">
              Today&apos;s questions haven&apos;t been published yet. Check back soon.
            </p>
          )}
          {!state && (
            <p className="mt-3 rounded-[10px] bg-red-tint p-3 text-sm text-red">We couldn&apos;t load today&apos;s game. Try refreshing.</p>
          )}
        </div>
      </section>

      <section className="grid gap-10 border-t border-line py-12 md:grid-cols-3">
        <div>
          <h2 className="font-display text-xl font-semibold">How it works</h2>
        </div>
        <ol className="space-y-5 md:col-span-2 md:grid md:grid-cols-3 md:gap-6 md:space-y-0">
          <li>
            <p className="font-semibold text-ink">One guess each</p>
            <p className="mt-1 text-sm text-muted">Estimate the price in dollars. You get a single official guess per question.</p>
          </li>
          <li>
            <p className="font-semibold text-ink">Closer is better</p>
            <p className="mt-1 text-sm text-muted">
              Up to 1,000 points per question. Being twice too high costs the same as being half too low.
            </p>
          </li>
          <li>
            <p className="font-semibold text-ink">Come back tomorrow</p>
            <p className="mt-1 text-sm text-muted">Finish all three on consecutive days to build a streak. New game at midnight ET.</p>
          </li>
        </ol>
      </section>

      <section aria-labelledby="today-board" className="border-t border-line py-12">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="today-board" className="font-display text-xl font-semibold">
            Today&apos;s top scores
          </h2>
          <Link href="/leaderboard" className="text-sm font-medium text-green-strong underline underline-offset-2">
            Full leaderboard
          </Link>
        </div>
        {board.length === 0 ? (
          <p className="mt-4 rounded-[12px] border border-dashed border-line-strong p-6 text-center text-sm text-muted">
            No finished games yet today. <Link href="/play" className="font-medium text-green-strong underline">Be the first to make the leaderboard.</Link>
          </p>
        ) : (
          <ol className="mt-4 divide-y divide-line rounded-[12px] border border-line bg-surface">
            {board.map((r) => (
              <li key={r.userId} className="flex items-center gap-3 px-4 py-3">
                <span className="tnum w-6 text-sm font-semibold text-muted">{r.rank}</span>
                <Avatar name={r.displayName ?? r.username ?? "Private"} url={r.avatarUrl} size={28} />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {r.username ? (
                    <Link href={`/profile/${r.username}`} className="hover:underline">
                      {r.displayName ?? r.username}
                    </Link>
                  ) : (
                    <span className="text-muted">Private player</span>
                  )}
                </span>
                <span className="tnum font-display font-semibold">{r.totalScore.toLocaleString("en-US")}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <AdSlot placement="home-secondary" />
    </div>
  );
}
