import { unstable_rethrow } from "next/navigation";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/player";
import { getGameState } from "@/lib/game/service";
import { formatGameDate } from "@/lib/dates";
import { GameBoard } from "@/components/game/game-board";
import { GameUnavailable, LoadError } from "@/components/game/unavailable";
import { logger } from "@/lib/logger";

export const metadata: Metadata = {
  title: "Today's game",
  description: "Guess three real-world prices: easy, medium and hard.",
  robots: { index: false },
};

export default async function PlayPage() {
  let state;
  try {
    const viewer = await getViewer();
    state = await getGameState(viewer.player);
  } catch (err) {
    unstable_rethrow(err);
    logger.error("play.load_failed", { error: String(err) });
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <LoadError />
      </div>
    );
  }

  if (!state.available) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <GameUnavailable gameDate={state.gameDate} />
      </div>
    );
  }

  if (state.questions.every((q) => q.attempt)) redirect("/results");

  return (
    <div className="mx-auto max-w-xl px-4 pb-10 pt-6 sm:pt-10">
      <p className="mb-5 text-sm text-muted">
        <time dateTime={state.gameDate}>{formatGameDate(state.gameDate)}</time>
      </p>
      <GameBoard key={state.setId} initialQuestions={state.questions} />
    </div>
  );
}
