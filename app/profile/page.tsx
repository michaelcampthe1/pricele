import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer, getAuthUser } from "@/lib/auth/session";
import { getPlayerStats } from "@/lib/stats/queries";
import { getClaimableGuestProgress } from "@/lib/auth/claimable";
import { formatGameDate, getGameDate } from "@/lib/dates";
import { Avatar } from "@/components/shared/avatar";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { StatsPanel } from "@/components/profile/stats";
import { ClaimCard } from "@/components/profile/claim-card";
import { DeleteAccountForm, ProfileForm } from "@/components/profile/settings-forms";

export const metadata: Metadata = { title: "Your profile", robots: { index: false } };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await getAuthUser();
  if (!user) redirect("/login?next=/profile");
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/profile");
  const [stats, claimable] = await Promise.all([getPlayerStats(viewer.id), getClaimableGuestProgress()]);

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8 sm:px-6 sm:py-12">
      {sp.password === "updated" ? <Alert tone="success">Your password was updated.</Alert> : null}
      {viewer.suspended ? <Alert tone="warning" title="Account suspended">You can't submit official guesses while your account is suspended.</Alert> : null}
      <header className="flex items-center gap-4">
        <Avatar name={viewer.username} url={viewer.avatarUrl} size={56} />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-[-0.01em]">{viewer.displayName ?? viewer.username}</h1>
          <p className="text-sm text-muted">
            @{viewer.username} · Joined {formatGameDate(getGameDate(new Date(viewer.createdAt)), "medium")}
            {viewer.isPublic ? (
              <>
                {" "}· <Link href={`/profile/${viewer.username}`} className="text-accent-strong hover:underline">View public profile</Link>
              </>
            ) : " · Private profile"}
          </p>
        </div>
      </header>

      {claimable ? <ClaimCard attempts={claimable.attempts} days={claimable.days} /> : null}
      {!viewer.usernameConfirmed ? (
        <Alert tone="info" title="Pick your username">
          We gave you <span className="font-mono">{viewer.username}</span> automatically. Choose your own below — it&apos;s what other players see on leaderboards.
        </Alert>
      ) : null}

      <section aria-labelledby="stats-heading" className="space-y-4">
        <h2 id="stats-heading" className="text-lg font-semibold">Your statistics</h2>
        <StatsPanel stats={stats} isSelf />
      </section>

      <section id="settings" aria-labelledby="settings-heading">
        <Card className="p-5 sm:p-6">
          <h2 id="settings-heading" className="mb-4 text-lg font-semibold">Profile settings</h2>
          <ProfileForm initial={{ username: viewer.username, displayName: viewer.displayName ?? "", avatarUrl: viewer.avatarUrl ?? "", isPublic: viewer.isPublic }} />
        </Card>
      </section>

      <section aria-labelledby="account-heading">
        <Card className="space-y-4 p-5 sm:p-6">
          <h2 id="account-heading" className="text-lg font-semibold">Account</h2>
          <p className="text-sm text-muted">Signed in as {user.email ?? "your account"}.</p>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href="/forgot-password" className="text-accent-strong hover:underline">Change password</Link>
            <form action="/auth/signout" method="post">
              <button type="submit" className="text-accent-strong hover:underline">Sign out</button>
            </form>
          </div>
          <details className="rounded-[var(--radius)] border border-error/20 bg-error-soft/40 p-4">
            <summary className="cursor-pointer text-sm font-medium text-error">Delete account</summary>
            <p className="my-3 text-sm text-ink-soft">
              This permanently deletes your account, profile, official results, streaks and practice history. Leaderboards update immediately. This can&apos;t be undone.
            </p>
            <DeleteAccountForm username={viewer.username} />
          </details>
        </Card>
      </section>
    </div>
  );
}
