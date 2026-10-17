import Link from "next/link";
import { Avatar } from "@/components/shared/avatar";
import { cn } from "@/lib/cn";
import { formatPoints } from "@/lib/money";
import type { LeaderboardRow, LeaderboardView } from "@/lib/leaderboard/queries";

function Name({ row }: { row: LeaderboardRow }) {
  const label = (
    <span className="flex min-w-0 items-center gap-2.5">
      <Avatar name={row.username} url={row.avatarUrl} size={28} />
      <span className="min-w-0">
        <span className="block truncate font-medium text-ink">{row.displayName ?? row.username}</span>
        {row.displayName ? <span className="block truncate text-xs text-muted">@{row.username}</span> : null}
      </span>
    </span>
  );
  return row.isPublic ? (
    <Link href={`/profile/${row.username}`} className="block min-w-0 rounded hover:underline">
      {label}
    </Link>
  ) : (
    label
  );
}

export function LeaderboardTable({
  view,
  rows,
  highlight,
  compact = false,
  caption,
}: {
  view: LeaderboardView;
  rows: LeaderboardRow[];
  highlight?: string | null;
  compact?: boolean;
  caption: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="tabular w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            <th scope="col" className="w-12 py-2.5 pl-4 pr-2 font-medium sm:pl-5">#</th>
            <th scope="col" className="py-2.5 pr-2 font-medium">Player</th>
            {view === "daily" && !compact ? (
              <>
                <th scope="col" className="hidden py-2.5 pr-2 text-right font-medium sm:table-cell">Easy</th>
                <th scope="col" className="hidden py-2.5 pr-2 text-right font-medium sm:table-cell">Medium</th>
                <th scope="col" className="hidden py-2.5 pr-2 text-right font-medium sm:table-cell">Hard</th>
              </>
            ) : null}
            {view !== "daily" && !compact ? (
              <th scope="col" className="py-2.5 pr-2 text-right font-medium">Games</th>
            ) : null}
            {view === "alltime" && !compact ? (
              <>
                <th scope="col" className="hidden py-2.5 pr-2 text-right font-medium md:table-cell">Perfect</th>
                <th scope="col" className="hidden py-2.5 pr-2 text-right font-medium md:table-cell">Best streak</th>
              </>
            ) : null}
            <th scope="col" className="py-2.5 pl-2 pr-4 text-right font-medium sm:pr-5">Points</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.username}
              className={cn("border-b border-border last:border-0", highlight === row.username && "bg-accent-soft/60")}
              aria-current={highlight === row.username ? "true" : undefined}
            >
              <td className="py-3 pl-4 pr-2 font-semibold text-ink-soft sm:pl-5">{row.rank}</td>
              <td className="max-w-0 py-3 pr-2">
                <Name row={row} />
              </td>
              {view === "daily" && !compact ? (
                <>
                  <td className="hidden py-3 pr-2 text-right text-ink-soft sm:table-cell">{formatPoints(row.easyScore ?? 0)}</td>
                  <td className="hidden py-3 pr-2 text-right text-ink-soft sm:table-cell">{formatPoints(row.mediumScore ?? 0)}</td>
                  <td className="hidden py-3 pr-2 text-right text-ink-soft sm:table-cell">{formatPoints(row.hardScore ?? 0)}</td>
                </>
              ) : null}
              {view !== "daily" && !compact ? <td className="py-3 pr-2 text-right text-ink-soft">{row.gamesCompleted}</td> : null}
              {view === "alltime" && !compact ? (
                <>
                  <td className="hidden py-3 pr-2 text-right text-ink-soft md:table-cell">{row.perfectGuesses}</td>
                  <td className="hidden py-3 pr-2 text-right text-ink-soft md:table-cell">{row.bestStreak}</td>
                </>
              ) : null}
              <td className="py-3 pl-2 pr-4 text-right font-semibold text-ink sm:pr-5">{formatPoints(row.totalScore)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
