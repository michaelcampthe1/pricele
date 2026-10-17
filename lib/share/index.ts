import { formatGameDate } from "@/lib/dates";
import { formatPoints } from "@/lib/money";

/** Spoiler-free share text: scores only, never answers or guesses. */
export function buildShareText(input: {
  gameDate: string;
  scores: { easy: number | null; medium: number | null; hard: number | null };
  total: number;
  max: number;
  streak?: number | null;
  url: string;
}): string {
  const line = (label: string, s: number | null) => `${label}: ${s === null ? "—" : `${formatPoints(s)}/1,000`}`;
  return [
    `Pricele — ${formatGameDate(input.gameDate, "short")}`,
    line("Easy", input.scores.easy),
    line("Medium", input.scores.medium),
    line("Hard", input.scores.hard),
    `Total: ${formatPoints(input.total)}/${formatPoints(input.max)}`,
    ...(input.streak && input.streak > 0 ? [`Streak: ${input.streak} ${input.streak === 1 ? "day" : "days"}`] : []),
    "Can you beat my score?",
    input.url,
  ].join("\n");
}
