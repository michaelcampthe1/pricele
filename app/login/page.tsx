import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { Divider, GoogleButton, SignInForm } from "@/components/auth/forms";
import { Alert } from "@/components/ui/alert";
import { getAuthUser } from "@/lib/auth/session";
import { publicEnv } from "@/lib/env";
import { safeNextPath } from "@/lib/security/redirect";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

const ERRORS: Record<string, string> = {
  callback: "That sign-in link is invalid or has expired. Please try again.",
  confirm: "That confirmation link is invalid or has expired.",
  oauth: "Google sign-in couldn't be started. Please try again.",
  google_disabled: "Google sign-in isn't configured on this site.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next, "/");
  if (await getAuthUser()) redirect(next);
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to save scores, keep your streak and join the leaderboard."
      footer={
        <>
          New to Pricele? <Link href={`/signup?next=${encodeURIComponent(next)}`} className="font-medium text-accent-strong hover:underline">Create an account</Link>
        </>
      }
    >
      {sp.error && ERRORS[sp.error] ? <Alert tone="error" className="mb-4">{ERRORS[sp.error]}</Alert> : null}
      {publicEnv().googleAuthEnabled ? (
        <>
          <GoogleButton next={next} />
          <Divider />
        </>
      ) : null}
      <SignInForm next={next} />
    </AuthShell>
  );
}
