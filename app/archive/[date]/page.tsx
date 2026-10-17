import { unstable_rethrow } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/player";
import { getArchiveState } from "@/lib/game/service";
import { formatGameDate, isGameDateString } from "@/lib/dates";
import { PracticeBoard } from "@/components/archive/practice-board";
import { LoadError } from "@/components/game/unavailable";
import { logger } from "@/lib/logger";

type Props = { params: Promise<{ date: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { date } = await params;
  if (!isGameDateString(date)) return { title: "Game not found" };
  return {
    title: `Game of ${formatGameDate(date, "short")}`,
    description: `Replay the Pricele game from ${formatGameDate(date)} in practice mode.`,
    alternates: { canonical: `/archive/${date}` },
  };
}

export default async function ArchiveGamePage({ params }: Props) {
  const { date } = await params;
  if (!isGameDateString(date)) notFound();
  let state;
  try {
    const viewer = await getViewer();
    state = await getArchiveState(viewer.player, date);
  } catch (err) {
    unstable_rethrow(err);
    logger.error("archive.detail_failed", { error: String(err) });
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <LoadError what="this game" />
      </div>
    );
  }
  if (!state.available) {
    if (date === state.today) redirect("/play");
    notFound();
  }

  return (
    <div className="mx-auto max-w-xl px-4 pb-10 pt-8">
      <Link href="/archive" className="text-sm text-muted hover:text-ink">
        ← Archive
      </Link>
      <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">{formatGameDate(date)}</h1>
      <p className="mt-2 rounded-[10px] bg-sunk px-3 py-2 text-sm text-ink-soft">
        Practice mode. Scores here are just for you: they don&apos;t affect leaderboards, streaks or official points.
      </p>
      <div className="mt-8">
        <PracticeBoard questions={state.questions} />
      </div>
    </div>
  );
}
