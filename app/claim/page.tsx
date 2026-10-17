import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { readGuestHash } from "@/lib/auth/guest";
import { guestSummary } from "@/lib/game/service";
import { safeNextPath } from "@/lib/auth/redirect";
import { AuthShell } from "@/components/auth/auth-shell";
import { ClaimForm } from "@/components/auth/claim-form";

export const metadata: Metadata = { title: "Save your guest results", robots: { index: false } };

export default async function ClaimPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next, "/play");
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/claim?next=${next}`)}`);
  const hash = await readGuestHash();
  const summary = hash ? await guestSummary(hash) : null;
  if (!summary?.valid || summary.attempts === 0) redirect(next);

  return (
    <AuthShell
      title="Save your guest results?"
      subtitle={
        <>
          You answered {summary.attempts} {summary.attempts === 1 ? "question" : "questions"} as a guest on this device
          {summary.sets > 1 ? ` across ${summary.sets} days` : ""}. Move them to your account to count them toward your stats, streak and
          the leaderboard.
        </>
      }
    >
      <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">
        <li>Your original guesses, times and scores are kept exactly as submitted.</li>
        <li>If you already played a day on this account, that day&apos;s account results stay and the guest ones are skipped.</li>
        <li>Practice games from the archive are not transferred.</li>
      </ul>
      <ClaimForm next={next} />
    </AuthShell>
  );
}
