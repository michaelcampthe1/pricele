import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, History } from "lucide-react";
import { getGameDate, formatGameDate, isValidGameDate } from "@/lib/dates";
import { listArchive } from "@/lib/game/queries";
import { getArchiveSummaries } from "@/lib/game/archive";
import { currentPlayer } from "@/lib/game/identity";
import { formatPoints } from "@/lib/money";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { AdSlot } from "@/components/shared/ad-slot";

export const metadata: Metadata = {
  title: "Archive",
  description: "Every past Pricele game. Review the answers or play them in practice mode.",
  alternates: { canonical: "/archive" },
};

export default async function ArchivePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const today = getGameDate();
  const before = sp.before && isValidGameDate(sp.before) && sp.before <= today ? sp.before : today;
  const [{ entries, hasMore }, player] = await Promise.all([listArchive(before, 20), currentPlayer()]);
  const summaries = await getArchiveSummaries(player, entries.map((e) => e.id));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-[-0.01em]">Archive</h1>
        <p className="mt-1.5 text-muted">Revisit past games. Archive play is practice: it never affects leaderboards or streaks.</p>
      </header>

      {entries.length === 0 ? (
        <EmptyState icon={<History aria-hidden className="size-8" />} title="No past games yet" action={<ButtonLink href="/play">Play today&apos;s game</ButtonLink>}>
          Once a daily game ends, it appears here.
        </EmptyState>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {entries.map((e) => {
              const s = summaries.get(e.id);
              const status = !s
                ? { label: "Not played", cls: "text-muted" }
                : s.officialAnswered === 3
                  ? { label: `${formatPoints(s.officialPoints)} pts`, cls: "font-semibold text-accent-strong" }
                  : s.officialAnswered > 0
                    ? { label: `${s.officialAnswered}/3 played`, cls: "text-ink-soft" }
                    : { label: `Practice ${formatPoints(s.practicePoints)} pts`, cls: "text-ink-soft" };
              return (
                <li key={e.id}>
                  <Link href={`/archive/${e.gameDate}`} className="flex items-center justify-between gap-3 px-4 py-4 transition-colors hover:bg-surface-muted/60 sm:px-5">
                    <span className="min-w-0">
                      <span className="block font-medium text-ink">{formatGameDate(e.gameDate)}</span>
                      <span className="mt-0.5 block text-xs text-muted">
                        Easy · Medium · Hard{e.isSample ? " · Sample" : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-sm">
                      <span className={`tabular ${status.cls}`}>{status.label}</span>
                      <ChevronRight aria-hidden className="size-4 text-muted" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <nav aria-label="Archive pages" className="mt-6 flex justify-between gap-3">
        {before !== today ? <ButtonLink href="/archive" variant="ghost">← Newest</ButtonLink> : <span />}
        {hasMore ? (
          <ButtonLink href={`/archive?before=${entries[entries.length - 1].gameDate}`} variant="secondary">
            Older games →
          </ButtonLink>
        ) : null}
      </nav>
      <AdSlot placement="archive-inline" className="mt-8" />
    </div>
  );
}
