import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell, Divider } from "@/components/auth/auth-shell";
import { GoogleButton, SignUpForm } from "@/components/auth/auth-forms";
import { safeNextPath } from "@/lib/auth/redirect";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

export default async function SignupPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next, "/play");
  if (await getSessionUser()) redirect(next);
  return (
    <AuthShell
      title="Create your account"
      subtitle="Free. Save your scores, build a streak, and join the leaderboard."
      footer={
        <>
          Already have an account?{" "}
          <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-medium text-green-strong underline underline-offset-2">
            Sign in
          </Link>
        </>
      }
    >
      <GoogleButton next={next} />
      <Divider />
      <SignUpForm next={next} />
    </AuthShell>
  );
}
