import { unstable_rethrow } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/auth/player";
import { listArchive } from "@/lib/game/service";
import { formatGameDate, isGameDateString } from "@/lib/dates";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { LoadError } from "@/components/game/unavailable";
import { AdSlot } from "@/components/shared/ad-slot";
import { logger } from "@/lib/logger";
import type { ArchiveListItem } from "@/lib/game/types";

export const metadata: Metadata = {
  title: "Archive",
  description: "Replay every past Pricele game in practice mode.",
  alternates: { canonical: "/archive" },
};

const PAGE = 20;

export default async function ArchivePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const before = isGameDateString(sp.before) ? sp.before : null;
  let items: ArchiveListItem[];
  try {
    const viewer = await getViewer();
    items = await listArchive(viewer.player, before, PAGE + 1);
  } catch (err) {
    unstable_rethrow(err);
    logger.error("archive.list_failed", { error: String(err) });
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <LoadError what="the archive" />
      </div>
    );
  }
  const hasMore = items.length > PAGE;
  const page = items.slice(0, PAGE);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <PageHeader title="Archive">
        Every past daily game. Replays are practice: they show your score but never change leaderboards or streaks.
      </PageHeader>

      {page.length === 0 ? (
        <EmptyState title={before ? "No older games" : "No past games yet"} action={<ButtonLink href="/play">Play today&apos;s game</ButtonLink>}>
          {before ? "You've reached the first Pricele game." : "Once a day's game ends, it appears here for practice."}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line rounded-[16px] border border-line bg-surface">
          {page.map((item) => {
            const played = item.officialAnswered > 0;
            const practiced = item.practiceAnswered > 0;
            return (
              <li key={item.gameDate}>
                <Link
                  href={`/archive/${item.gameDate}`}
                  className="flex items-center justify-between gap-4 px-4 py-4 transition-colors hover:bg-green-wash sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{formatGameDate(item.gameDate)}</p>
                    <p className="mt-0.5 text-sm text-muted">Easy, medium and hard</p>
                  </div>
                  <div className="shrink-0 text-right text-sm">
                    {played ? (
                      <>
                        <p className="tnum font-display text-lg font-semibold text-green-strong">{item.officialTotal.toLocaleString("en-US")}</p>
                        <p className="text-muted">{item.officialAnswered === 3 ? "Played" : `Played ${item.officialAnswered}/3`}</p>
                      </>
                    ) : practiced ? (
                      <p className="text-muted">Practiced {item.practiceAnswered}/3</p>
                    ) : (
                      <p className="font-medium text-green-strong">Play</p>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <AdSlot placement="archive-inline" />

      <nav aria-label="Archive pages" className="mt-6 flex justify-between gap-4">
        {before ? (
          <Link href="/archive" className="text-sm font-medium text-green-strong underline underline-offset-2">
            Newest games
          </Link>
        ) : (
          <span />
        )}
        {hasMore && (
          <Link href={`/archive?before=${page[page.length - 1].gameDate}`} className="text-sm font-medium text-green-strong underline underline-offset-2">
            Older games
          </Link>
        )}
      </nav>
    </div>
  );
}
