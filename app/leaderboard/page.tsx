import { unstable_rethrow } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { getViewer } from "@/lib/auth/player";
import { getDailyLeaderboard, getPeriodLeaderboard } from "@/lib/game/service";
import type { LeaderboardRow } from "@/lib/game/types";
import { addDays, formatGameDate, gameDateFor, isGameDateString, weekRange } from "@/lib/dates";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { LeaderboardTable } from "@/components/leaderboard/table";
import { LoadError } from "@/components/game/unavailable";
import { AdSlot } from "@/components/shared/ad-slot";
import { logger } from "@/lib/logger";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Daily, weekly and all-time Pricele rankings.",
  alternates: { canonical: "/leaderboard" },
};

const VIEWS = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "alltime", label: "All-time" },
] as const;
type View = (typeof VIEWS)[number]["id"];
const PAGE = 50;

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const view: View = VIEWS.some((v) => v.id === sp.view) ? (sp.view as View) : "daily";
  const today = gameDateFor();
  const date = isGameDateString(sp.date) && sp.date <= today ? sp.date : today;
  const week = weekRange(date);
  const page = Math.max(1, Math.min(100, Number.parseInt(sp.page ?? "1", 10) || 1));
  const offset = (page - 1) * PAGE;

  let rows: LeaderboardRow[];
  let viewerId: string | null = null;
  try {
    const viewer = await getViewer();
    viewerId = viewer.player.userId;
    rows =
      view === "daily"
        ? await getDailyLeaderboard(date, PAGE, offset)
        : view === "weekly"
          ? await getPeriodLeaderboard(week.from, week.to, PAGE, offset)
          : await getPeriodLeaderboard(null, null, PAGE, offset);
  } catch (err) {
    unstable_rethrow(err);
    logger.error("leaderboard.load_failed", { error: String(err) });
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <LoadError what="the leaderboard" />
      </div>
    );
  }

  const participants = rows[0]?.participants ?? 0;
  const pageHref = (p: number) => {
    const q = new URLSearchParams({ view, page: String(p) });
    if (view !== "alltime") q.set("date", date);
    return `/leaderboard?${q.toString()}`;
  };
  const provisional = view === "daily" ? date === today : view === "weekly" ? week.to >= today : true;
  const prevDate = view === "weekly" ? addDays(week.from, -7) : addDays(date, -1);
  const nextDate = view === "weekly" ? addDays(week.from, 7) : addDays(date, 1);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <PageHeader title="Leaderboard">Signed-in players who finish all three questions. Practice games never count.</PageHeader>

      <nav aria-label="Leaderboard period" className="mb-6 inline-flex rounded-[12px] border border-line bg-surface p-1">
        {VIEWS.map((v) => (
          <Link
            key={v.id}
            href={v.id === "alltime" ? "/leaderboard?view=alltime" : `/leaderboard?view=${v.id}&date=${date}`}
            aria-current={view === v.id ? "page" : undefined}
            className="rounded-[9px] px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-ink aria-[current=page]:bg-ink aria-[current=page]:text-white"
          >
            {v.label}
          </Link>
        ))}
      </nav>

      {view !== "alltime" && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-display text-lg font-semibold">
              {view === "daily" ? formatGameDate(date) : `Week of ${formatGameDate(week.from, "short")} – ${formatGameDate(week.to, "short")}`}
            </p>
            <p className="text-sm text-muted">
              {provisional ? "Provisional: standings can change until the period ends at midnight ET." : "Final standings."}{" "}
              {participants > 0 && `${participants.toLocaleString("en-US")} ${participants === 1 ? "player" : "players"}.`}
            </p>
          </div>
          <div className="flex gap-2 text-sm">
            <Link href={`/leaderboard?view=${view}&date=${prevDate}`} className="rounded-md border border-line bg-surface px-3 py-1.5 font-medium hover:bg-sunk">
              Earlier
            </Link>
            {nextDate <= today && (
              <Link href={`/leaderboard?view=${view}&date=${nextDate}`} className="rounded-md border border-line bg-surface px-3 py-1.5 font-medium hover:bg-sunk">
                Later
              </Link>
            )}
          </div>
        </div>
      )}
      {view === "alltime" && (
        <p className="mb-4 text-sm text-muted">
          Cumulative official points. All-time totals reward playing often, so games completed are shown alongside.
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={<Trophy className="h-8 w-8" />}
          title="Be the first to make the leaderboard."
          action={<ButtonLink href="/play">Play today&apos;s game</ButtonLink>}
        >
          {viewerId ? "Finish all three of today's questions to appear here." : "Create a free account and finish today's game to appear here."}
        </EmptyState>
      ) : (
        <LeaderboardTable rows={rows} mode={view === "daily" ? "daily" : "period"} viewerId={viewerId} />
      )}

      {(page > 1 || rows.length === PAGE) && (
        <nav aria-label="Leaderboard pages" className="mt-4 flex justify-between text-sm">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="font-medium text-green-strong underline">
              Previous
            </Link>
          ) : (
            <span />
          )}
          {rows.length === PAGE && (
            <Link href={pageHref(page + 1)} className="font-medium text-green-strong underline">
              Next
            </Link>
          )}
        </nav>
      )}

      <p className="mt-6 text-xs text-muted">
        Ties are broken by more perfect guesses, then more points on hard questions, then whoever finished first. Players are ranked
        equally only if all of these match.
      </p>
      <AdSlot placement="leaderboard-secondary" />
    </div>
  );
}
