import { formatGameDate } from "@/lib/dates";

export type ShareInput = {
  gameDate: string;
  easy: number;
  medium: number;
  hard: number;
  streak?: number | null;
  url?: string;
};

const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);

/** Bar of five blocks proportional to a 0–1000 score. Spoiler-free: never includes answers. */
export function scoreBar(score: number): string {
  const filled = Math.max(0, Math.min(5, Math.round(score / 200)));
  return "🟩".repeat(filled) + "⬜".repeat(5 - filled);
}

export function buildShareText(input: ShareInput): string {
  const total = input.easy + input.medium + input.hard;
  const lines = [
    `Pricele — ${formatGameDate(input.gameDate, "short")}`,
    `Easy: ${fmt(input.easy)}/1,000 ${scoreBar(input.easy)}`,
    `Medium: ${fmt(input.medium)}/1,000 ${scoreBar(input.medium)}`,
    `Hard: ${fmt(input.hard)}/1,000 ${scoreBar(input.hard)}`,
    `Total: ${fmt(total)}/3,000`,
  ];
  if (input.streak && input.streak > 0) {
    lines.push(`Streak: ${input.streak} ${input.streak === 1 ? "day" : "days"}`);
  }
  lines.push("Can you beat my score?");
  if (input.url) lines.push(input.url);
  return lines.join("\n");
}
