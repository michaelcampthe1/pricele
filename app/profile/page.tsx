import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/player";
import { getProfileStats } from "@/lib/game/service";
import { StatsPanel } from "@/components/profile/stats";
import { DeleteAccountForm, ProfileForm, UsernameForm } from "@/components/profile/settings-forms";
import { Alert, Avatar } from "@/components/ui/misc";
import { formatGameDate } from "@/lib/dates";

export const metadata: Metadata = { title: "Your profile", robots: { index: false } };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const viewer = await getViewer();
  if (!viewer.profile || !viewer.user) redirect("/login?next=/profile");
  const p = viewer.profile;
  const stats = await getProfileStats(p.id);
  const claimed = Number(sp.claimed ?? 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <header className="mb-8 flex flex-wrap items-center gap-4">
        <Avatar name={p.displayName ?? p.username} url={p.avatarUrl} size={56} />
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-bold tracking-tight">{p.displayName ?? p.username}</h1>
          <p className="text-sm text-muted">
            @{p.username} · Joined {formatGameDate(p.createdAt.slice(0, 10), "short")}{" "}
            {p.isPublic && (
              <Link href={`/profile/${p.username}`} className="ml-1 font-medium text-green-strong underline underline-offset-2">
                View public profile
              </Link>
            )}
          </p>
        </div>
      </header>

      <div className="space-y-3">
        {claimed > 0 && (
          <Alert tone="success" role="status" title="Guest results saved">
            {claimed} guest {claimed === 1 ? "answer was" : "answers were"} added to your account.
            {Number(sp.skipped) > 0 && " Days you'd already played on this account kept their original results."}
          </Alert>
        )}
        {sp.password === "updated" && <Alert tone="success" role="status">Your password was updated.</Alert>}
        {p.isSuspended && (
          <Alert tone="warning" title="Your account is suspended">
            You can view your history but can&apos;t submit guesses. Contact support if you think this is a mistake.
          </Alert>
        )}
      </div>

      <section aria-labelledby="stats" className="mt-6">
        <h2 id="stats" className="sr-only">
          Statistics
        </h2>
        <StatsPanel stats={stats} own />
      </section>

      <section aria-labelledby="settings" className="mt-14 grid gap-10 border-t border-line pt-10 md:grid-cols-[14rem_1fr]">
        <div>
          <h2 id="settings" className="font-display text-xl font-semibold">
            Account settings
          </h2>
          <p className="mt-1 text-sm text-muted">Signed in as {viewer.user.email ?? "your account"}.</p>
        </div>
        <div className="space-y-10">
          <ProfileForm displayName={p.displayName} avatarUrl={p.avatarUrl} isPublic={p.isPublic} />
          <div className="border-t border-line pt-8">
            <UsernameForm username={p.username} />
          </div>
          <div className="border-t border-line pt-8">
            <h3 className="font-semibold">Password</h3>
            <p className="mt-1 text-sm text-muted">
              <Link href="/forgot-password" className="font-medium text-green-strong underline underline-offset-2">
                Send a password reset link
              </Link>{" "}
              to change your password.
            </p>
          </div>
          <div className="rounded-[12px] border border-red/20 p-5">
            <h3 className="font-semibold text-red">Delete account</h3>
            <div className="mt-3">
              <DeleteAccountForm />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
