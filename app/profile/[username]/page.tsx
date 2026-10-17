import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicProfile } from "@/lib/game/service";
import { StatsPanel } from "@/components/profile/stats";
import { Avatar } from "@/components/ui/misc";
import { formatGameDate } from "@/lib/dates";

type Props = { params: Promise<{ username: string }> };

function valid(u: string) {
  return /^[a-z][a-z0-9_]{2,19}$/i.test(u);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  if (!valid(username)) return { title: "Player not found" };
  const p = await getPublicProfile(username);
  if (!p) return { title: "Player not found", robots: { index: false } };
  return {
    title: `${p.displayName ?? p.username} (@${p.username})`,
    description: `${p.stats.gamesCompleted} games played on Pricele.`,
    alternates: { canonical: `/profile/${p.username}` },
  };
}

export default async function PublicProfilePage({ params }: Props) {
  const { username } = await params;
  if (!valid(username)) notFound();
  const p = await getPublicProfile(username);
  if (!p) notFound();
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <header className="mb-8 flex items-center gap-4">
        <Avatar name={p.displayName ?? p.username} url={p.avatarUrl} size={56} />
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">{p.displayName ?? p.username}</h1>
          <p className="text-sm text-muted">
            @{p.username} · Playing since {formatGameDate(p.createdAt.slice(0, 10), "short")}
          </p>
        </div>
      </header>
      <StatsPanel stats={p.stats} own={false} />
    </div>
  );
}
