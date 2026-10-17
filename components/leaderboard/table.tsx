import Link from "next/link";
import type { LeaderboardRow } from "@/lib/game/types";
import { Avatar } from "@/components/ui/misc";

export function LeaderboardTable({
  rows,
  mode,
  viewerId,
}: {
  rows: LeaderboardRow[];
  mode: "daily" | "period";
  viewerId: string | null;
}) {
  return (
    <div className="overflow-x-auto rounded-[16px] border border-line bg-surface">
      <table className="w-full min-w-[340px] text-sm">
        <caption className="sr-only">
          {mode === "daily" ? "Daily rankings" : "Rankings"} ordered by points, then perfect guesses, then hard-question points, then earliest finish
        </caption>
        <thead className="text-left text-muted">
          <tr className="border-b border-line">
            <th scope="col" className="w-12 px-4 py-3 font-medium">#</th>
            <th scope="col" className="px-2 py-3 font-medium">Player</th>
            {mode === "daily" ? (
              <>
                <th scope="col" className="hidden px-2 py-3 text-right font-medium sm:table-cell">Easy</th>
                <th scope="col" className="hidden px-2 py-3 text-right font-medium sm:table-cell">Medium</th>
                <th scope="col" className="hidden px-2 py-3 text-right font-medium sm:table-cell">Hard</th>
              </>
            ) : (
              <>
                <th scope="col" className="px-2 py-3 text-right font-medium">Games</th>
                <th scope="col" className="hidden px-2 py-3 text-right font-medium sm:table-cell">Perfect</th>
              </>
            )}
            <th scope="col" className="px-4 py-3 text-right font-medium">Points</th>
          </tr>
        </thead>
        <tbody className="tnum">
          {rows.map((r) => {
            const me = r.userId === viewerId;
            const name = r.displayName ?? r.username;
            return (
              <tr key={r.userId} className={`border-b border-line last:border-0 ${me ? "bg-green-wash" : ""}`} aria-current={me ? "true" : undefined}>
                <td className="px-4 py-3 font-semibold text-muted">{r.rank}</td>
                <td className="px-2 py-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={name ?? "Private"} url={r.avatarUrl} size={28} />
                    <div className="min-w-0">
                      {r.username ? (
                        <Link href={`/profile/${r.username}`} className="block truncate font-medium text-ink hover:underline">
                          {name}
                        </Link>
                      ) : (
                        <span className="block truncate text-muted">Private player</span>
                      )}
                      {me && <span className="text-xs font-medium text-green-strong">You</span>}
                    </div>
                  </div>
                </td>
                {mode === "daily" ? (
                  <>
                    <td className="hidden px-2 py-3 text-right sm:table-cell">{r.easyScore}</td>
                    <td className="hidden px-2 py-3 text-right sm:table-cell">{r.mediumScore}</td>
                    <td className="hidden px-2 py-3 text-right sm:table-cell">{r.hardScore}</td>
                  </>
                ) : (
                  <>
                    <td className="px-2 py-3 text-right">{r.gamesCompleted}</td>
                    <td className="hidden px-2 py-3 text-right sm:table-cell">{r.perfectGuesses}</td>
                  </>
                )}
                <td className="px-4 py-3 text-right font-display text-base font-semibold text-ink">{r.totalScore.toLocaleString("en-US")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
