import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatGameDate, getGameDate, isValidGameDate, addDays } from "@/lib/dates";
import { getLiveSet, getOfficialResults, getPracticeResults, summarize } from "@/lib/game/queries";
import { currentPlayer } from "@/lib/game/identity";
import { formatPoints } from "@/lib/money";
import { ArchiveClient } from "@/components/archive/archive-client";
import { SampleBanner } from "@/components/game/unavailable";
import { Alert } from "@/components/ui/alert";

type Props = { params: Promise<{ date: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { date } = await params;
  if (!isValidGameDate(date)) return { title: "Archive" };
  return {
    title: `Game of ${formatGameDate(date, "medium")}`,
    description: `Play the Pricele game from ${formatGameDate(date, "medium")} in practice mode.`,
    alternates: { canonical: `/archive/${date}` },
  };
}

export default async function ArchiveDatePage({ params }: Props) {
  const { date } = await params;
  const today = getGameDate();
  if (!isValidGameDate(date) || date > today) notFound();
  if (date === today) redirect("/play");

  const set = await getLiveSet(date);
  if (!set) notFound();
  const player = await currentPlayer();
  const [official, practice] = await Promise.all([getOfficialResults(player, set), getPracticeResults(player, set)]);
  const merged = new Map(practice);
  for (const [id, r] of official) merged.set(id, r);
  const officialSummary = summarize(set, official);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/archive" className="hover:text-ink hover:underline">Archive</Link> / {formatGameDate(date, "short")}
      </nav>
      <header className="mt-2 mb-6">
        <h1 className="text-2xl font-semibold tracking-[-0.01em] sm:text-3xl">{formatGameDate(date)}</h1>
        <p className="mt-1.5 text-muted">
          {officialSummary.answered > 0
            ? `You played this day officially: ${formatPoints(officialSummary.total)} points across ${officialSummary.answered} ${officialSummary.answered === 1 ? "question" : "questions"}.`
            : "Practice mode. Guesses here are just for fun and don't count toward leaderboards or streaks."}
        </p>
      </header>
      {set.isSample ? <SampleBanner /> : null}
      {officialSummary.answered > 0 && officialSummary.answered < officialSummary.required ? (
        <Alert tone="info" className="mb-4">Unanswered questions from that day can be played here as practice; your official result for the day is unchanged.</Alert>
      ) : null}
      <div className="mt-4">
        <ArchiveClient set={set} initialResults={[...merged.values()]} />
      </div>
      <nav aria-label="Other days" className="mt-8 flex justify-between text-sm">
        <Link href={`/archive/${addDays(date, -1)}`} className="text-accent-strong hover:underline">← Previous day</Link>
        {addDays(date, 1) < today ? <Link href={`/archive/${addDays(date, 1)}`} className="text-accent-strong hover:underline">Next day →</Link> : <Link href="/play" className="text-accent-strong hover:underline">Today&apos;s game →</Link>}
      </nav>
    </div>
  );
}
