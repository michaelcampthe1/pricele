import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { createPublicClient } from "@/lib/supabase/server";
import { getPlayerStats } from "@/lib/stats/queries";
import { formatGameDate, getGameDate } from "@/lib/dates";
import { USERNAME_RE } from "@/lib/validation";
import { Avatar } from "@/components/shared/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { StatsPanel } from "@/components/profile/stats";

type Props = { params: Promise<{ username: string }> };

/** Public profiles are read through the anon client: RLS only returns is_public profiles. */
async function loadPublicProfile(username: string) {
  if (!USERNAME_RE.test(username)) return null;
  const { data } = await createPublicClient()
    .from("profiles")
    .select("id, username, display_name, avatar_url, created_at")
    .eq("username", username)
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const profile = await loadPublicProfile(username.toLowerCase());
  return profile
    ? { title: `${profile.display_name ?? profile.username} on Pricele`, description: `Pricele stats for @${profile.username}.` }
    : { title: "Profile", robots: { index: false } };
}

export default async function PublicProfilePage({ params }: Props) {
  const { username } = await params;
  const normalized = username.toLowerCase();
  if (!USERNAME_RE.test(normalized)) notFound();
  const profile = await loadPublicProfile(normalized);
  if (!profile) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <EmptyState icon={<Lock aria-hidden className="size-7" />} title="This profile isn't available">
          The player may have a private profile, or the username doesn&apos;t exist.
        </EmptyState>
      </div>
    );
  }
  const stats = await getPlayerStats(profile.id);
  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex items-center gap-4">
        <Avatar name={profile.username} url={profile.avatar_url} size={56} />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-[-0.01em]">{profile.display_name ?? profile.username}</h1>
          <p className="text-sm text-muted">
            @{profile.username} · Playing since {formatGameDate(getGameDate(new Date(profile.created_at)), "medium")}
          </p>
        </div>
      </header>
      <StatsPanel stats={stats} isSelf={false} />
    </div>
  );
}
