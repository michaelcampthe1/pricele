import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicResult } from "@/lib/game/service";
import { formatGameDate, isGameDateString } from "@/lib/dates";
import { scoreBar } from "@/lib/share";
import { ButtonLink } from "@/components/ui/button";

type Props = { params: Promise<{ username: string; date: string }> };

async function load(params: Props["params"]) {
  const { username, date } = await params;
  if (!/^[a-z][a-z0-9_]{2,19}$/i.test(username) || !isGameDateString(date)) return null;
  return getPublicResult(username, date);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await load(params);
  if (!r) return { title: "Result not found", robots: { index: false } };
  const title = `${r.displayName ?? r.username} scored ${r.total.toLocaleString("en-US")}/3,000 on Pricele`;
  return {
    title,
    description: `Pricele for ${formatGameDate(r.gameDate, "short")}. Can you beat it?`,
    openGraph: { title, description: "Three prices. One guess each. Can you beat this score?" },
    robots: { index: false },
  };
}

/** Public, spoiler-free share page. Only exists for public profiles. */
export default async function SharePage({ params }: Props) {
  const r = await load(params);
  if (!r) notFound();
  const rows = [
    ["Easy", r.easy],
    ["Medium", r.medium],
    ["Hard", r.hard],
  ] as const;
  return (
    <div className="mx-auto max-w-md px-4 py-14 text-center">
      <p className="text-sm text-muted">Pricele · {formatGameDate(r.gameDate, "short")}</p>
      <h1 className="mt-2 font-display text-2xl font-semibold">{r.displayName ?? `@${r.username}`} scored</h1>
      <p className="tnum mt-3 font-display text-6xl font-bold text-green-strong">
        {r.total.toLocaleString("en-US")}
        <span className="text-2xl font-semibold text-muted"> / 3,000</span>
      </p>
      <ul className="mx-auto mt-6 max-w-xs space-y-2 text-left">
        {rows.map(([label, score]) => (
          <li key={label} className="flex items-center justify-between gap-3 text-sm">
            <span className="w-16 font-medium">{label}</span>
            <span aria-hidden>{scoreBar(score)}</span>
            <span className="tnum w-12 text-right">{score}</span>
          </li>
        ))}
      </ul>
      <div className="mt-8">
        <ButtonLink href="/play" size="lg">
          Play today&apos;s game
        </ButtonLink>
      </div>
    </div>
  );
}
