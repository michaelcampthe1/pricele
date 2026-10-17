import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { formatGameDate } from "@/lib/dates";
import { loadToday } from "@/lib/game/today";
import { GameClient } from "@/components/game/game-client";
import { GameUnavailable, SampleBanner } from "@/components/game/unavailable";

export const metadata: Metadata = {
  title: "Today's Game",
  description: "Guess three prices — Easy, Medium and Hard. One guess each, up to 1,000 points per question.",
  alternates: { canonical: "/play" },
};

export default async function PlayPage() {
  const { gameDate, set, results, summary } = await loadToday();
  if (set && summary?.complete) redirect("/results");

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-6">
        <p className="text-sm font-medium text-accent-strong">Daily game</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-[-0.01em] sm:text-3xl">{formatGameDate(gameDate)}</h1>
      </header>
      {set ? (
        <div className="space-y-4">
          {set.isSample ? <SampleBanner /> : null}
          <GameClient set={set} initialResults={[...results.values()]} />
        </div>
      ) : (
        <GameUnavailable />
      )}
    </div>
  );
}
