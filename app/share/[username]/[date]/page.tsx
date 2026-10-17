import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/server";
import { getLeaderboard } from "@/lib/leaderboard/queries";
import { formatGameDate, getGameDate, isValidGameDate } from "@/lib/dates";
import { formatPoints } from "@/lib/money";
import { USERNAME_RE } from "@/lib/validation";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Avatar } from "@/components/shared/avatar";

type Props = { params: Promise<{ username: string; date: string }> };

/**
 * Public, spoiler-free result card. Only shown for public profiles (RLS on profiles) and only
 * for completed official results (leaderboard function). Never includes guesses or answers.
 */
async function load(username: string, date: string) {
  if (!USERNAME_RE.test(username) || !isValidGameDate(date) || date > getGameDate()) return null;
  const { data: profile } = await createPublicClient()
    .from("profiles")
    .select("username, display_name, avatar_url")
    .eq("username", username)
    .maybeSingle();
  if (!profile) return null;
  const board = await getLeaderboard("daily", { date, username, limit: 1 });
  const row = board.rows[0];
  return row ? { profile, row } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username, date } = await params;
  const data = await load(username.toLowerCase(), date);
  if (!data) return { title: "Shared result", robots: { index: false } };
  const title = `${data.profile.display_name ?? data.profile.username} scored ${formatPoints(data.row.totalScore)} on Pricele`;
  const description = `Pricele, ${formatGameDate(date, "medium")}: Easy ${data.row.easyScore}, Medium ${data.row.mediumScore}, Hard ${data.row.hardScore}. Can you beat it?`;
  return { title, description, openGraph: { title, description }, twitter: { title, description }, robots: { index: false } };
}

export default async function SharePage({ params }: Props) {
  const { username, date } = await params;
  const data = await load(username.toLowerCase(), date);
  if (!data) notFound();
  const { profile, row } = data;
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <Card className="overflow-hidden text-center">
        <div className="bg-accent-soft/60 px-6 py-8">
          <Avatar name={profile.username} url={profile.avatar_url} size={48} className="mx-auto" />
          <h1 className="mt-3 text-lg font-semibold">{profile.display_name ?? `@${profile.username}`}</h1>
          <p className="text-sm text-muted">Pricele · {formatGameDate(date, "medium")}</p>
          <p className="tabular mt-4 text-6xl font-semibold tracking-[-0.03em]">{formatPoints(row.totalScore)}</p>
          <p className="tabular text-muted">out of 3,000 · rank #{row.rank}</p>
        </div>
        <dl className="tabular grid grid-cols-3 divide-x divide-border border-t border-border">
          {[["Easy", row.easyScore], ["Medium", row.mediumScore], ["Hard", row.hardScore]].map(([k, v]) => (
            <div key={k as string} className="py-4">
              <dt className="text-xs uppercase tracking-wide text-muted">{k}</dt>
              <dd className="text-lg font-semibold">{formatPoints(v as number)}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <div className="mt-6 text-center">
        <ButtonLink href={date === getGameDate() ? "/play" : `/archive/${date}`} size="lg">
          {date === getGameDate() ? "Play today's game" : "Try this game"}
        </ButtonLink>
      </div>
    </div>
  );
}
