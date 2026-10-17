import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Trophy } from "lucide-react";
import { addDays, formatGameDate, getGameDate, isValidGameDate, weekStart } from "@/lib/dates";
import { getLeaderboard, PAGE_SIZE, type LeaderboardView } from "@/lib/leaderboard/queries";
import { getViewer } from "@/lib/auth/session";
import { formatPoints } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { LeaderboardTable } from "@/components/leaderboard/leaderboard-table";
import { AdSlot } from "@/components/shared/ad-slot";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Daily, weekly and all-time Pricele rankings.",
  alternates: { canonical: "/leaderboard" },
};

const TABS: { view: LeaderboardView; label: string }[] = [
  { view: "daily", label: "Daily" },
  { view: "weekly", label: "Weekly" },
  { view: "alltime", label: "All-Time" },
];

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const view: LeaderboardView = sp.view === "weekly" || sp.view === "alltime" ? sp.view : "daily";
  const today = getGameDate();
  const date = sp.date && isValidGameDate(sp.date) && sp.date <= today ? sp.date : today;
  const currentWeek = weekStart(today);
  const week = sp.week && isValidGameDate(sp.week) && sp.week <= currentWeek ? weekStart(sp.week) : currentWeek;
  const page = Math.max(1, Math.min(1000, Number.parseInt(sp.page ?? "1", 10) || 1));

  const viewer = await getViewer();
  const opts = { date, weekStart: week, page };
  const [board, mine] = await Promise.all([
    getLeaderboard(view, opts),
    viewer ? getLeaderboard(view, { ...opts, page: 1, username: viewer.username, limit: 1 }) : null,
  ]);
  const me = mine?.rows[0];
  const meOnPage = me && board.rows.some((r) => r.username === me.username);
  const totalPages = Math.max(1, Math.ceil(board.totalCount / PAGE_SIZE));
  const provisional = (view === "daily" && date === today) || (view === "weekly" && week === currentWeek);

  const href = (p: Record<string, string | number>) => {
    const q = new URLSearchParams({ view, ...(view === "daily" ? { date } : {}), ...(view === "weekly" ? { week } : {}) });
    for (const [k, v] of Object.entries(p)) q.set(k, String(v));
    return `/leaderboard?${q.toString()}`;
  };

  const periodLabel =
    view === "daily" ? formatGameDate(date) : view === "weekly" ? `Week of ${formatGameDate(week, "medium")}` : "All official games";

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-[-0.01em]">Leaderboard</h1>
        <p className="mt-1.5 text-muted">Completed official games by signed-in players. Practice games never count.</p>
      </header>

      <nav aria-label="Leaderboard period" className="mb-5 inline-flex rounded-[var(--radius)] border border-border bg-surface p-1">
        {TABS.map((t) => (
          <Link
            key={t.view}
            href={`/leaderboard?view=${t.view}`}
            aria-current={t.view === view ? "page" : undefined}
            className={cn(
              "rounded-[var(--radius-sm)] px-4 py-1.5 text-sm font-medium transition-colors",
              t.view === view ? "bg-ink text-bg" : "text-ink-soft hover:text-ink",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          {view !== "alltime" ? (
            <Link
              href={view === "daily" ? href({ date: addDays(date, -1), page: 1 }) : href({ week: addDays(week, -7), page: 1 })}
              className="inline-flex size-9 items-center justify-center rounded-[var(--radius-sm)] text-ink-soft hover:bg-surface-muted"
              aria-label={view === "daily" ? "Previous day" : "Previous week"}
            >
              <ChevronLeft aria-hidden className="size-4" />
            </Link>
          ) : null}
          <h2 className="px-1 font-semibold">{periodLabel}</h2>
          {view !== "alltime" && (view === "daily" ? date < today : week < currentWeek) ? (
            <Link
              href={view === "daily" ? href({ date: addDays(date, 1), page: 1 }) : href({ week: addDays(week, 7), page: 1 })}
              className="inline-flex size-9 items-center justify-center rounded-[var(--radius-sm)] text-ink-soft hover:bg-surface-muted"
              aria-label={view === "daily" ? "Next day" : "Next week"}
            >
              <ChevronRight aria-hidden className="size-4" />
            </Link>
          ) : null}
        </div>
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", provisional ? "bg-warning-soft text-warning" : "bg-surface-muted text-ink-soft")}>
          {view === "alltime" ? "Updated live" : provisional ? "Provisional — in progress" : "Final"}
        </span>
      </div>

      {me && !meOnPage ? (
        <p className="tabular mb-3 rounded-[var(--radius)] bg-accent-soft/70 px-4 py-2.5 text-sm">
          Your position: <span className="font-semibold">#{me.rank}</span> with {formatPoints(me.totalScore)} points
        </p>
      ) : null}

      {board.rows.length === 0 ? (
        <EmptyState icon={<Trophy aria-hidden className="size-8" />} title="Be the first to make the leaderboard." action={<ButtonLink href="/play">Play today&apos;s game</ButtonLink>}>
          {view === "daily" ? "No signed-in player has completed this day's game yet." : "No completed official games in this period yet."}
        </EmptyState>
      ) : (
        <Card>
          <LeaderboardTable view={view} rows={board.rows} highlight={viewer?.username} caption={`${TABS.find((t) => t.view === view)!.label} leaderboard, ${periodLabel}`} />
        </Card>
      )}

      {totalPages > 1 ? (
        <nav aria-label="Leaderboard pages" className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? <Link className="text-accent-strong hover:underline" href={href({ page: page - 1 })}>← Previous</Link> : <span />}
          <span className="text-muted">Page {page} of {totalPages}</span>
          {page < totalPages ? <Link className="text-accent-strong hover:underline" href={href({ page: page + 1 })}>Next →</Link> : <span />}
        </nav>
      ) : null}

      <details className="mt-8 text-sm text-muted">
        <summary className="cursor-pointer font-medium text-ink-soft">How rankings work</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Only complete official daily games (all three questions) by signed-in players count.</li>
          <li>Weeks run Monday 12:00 AM to the following Monday, Eastern Time.</li>
          <li>Ties are broken by: more perfect guesses (exactly 1,000 points), then higher Hard-question points, then the earlier final submission. Players identical on all of these share a rank.</li>
          <li>All-time totals reward playing often, so the number of games completed is shown alongside points.</li>
        </ul>
      </details>
      <AdSlot placement="leaderboard-secondary" className="mt-8" />
    </div>
  );
}
