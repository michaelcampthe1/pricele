import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell, Divider } from "@/components/auth/auth-shell";
import { GoogleButton, SignInForm } from "@/components/auth/auth-forms";
import { Alert } from "@/components/ui/misc";
import { safeNextPath } from "@/lib/auth/redirect";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

const ERRORS: Record<string, string> = {
  callback: "That sign-in link is invalid or has expired. Try signing in again.",
  oauth: "We couldn't start Google sign-in. Try again or use email.",
  not_configured: "Sign-in isn't configured on this deployment yet.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next, "/play");
  if (await getSessionUser()) redirect(next);
  return (
    <AuthShell
      title="Sign in to Pricele"
      subtitle="Keep your streak and compete on the leaderboard."
      footer={
        <>
          New here?{" "}
          <Link href={`/signup?next=${encodeURIComponent(next)}`} className="font-medium text-green-strong underline underline-offset-2">
            Create an account
          </Link>
        </>
      }
    >
      {sp.error && ERRORS[sp.error] && <Alert tone="error">{ERRORS[sp.error]}</Alert>}
      <GoogleButton next={next} />
      <Divider />
      <SignInForm next={next} />
    </AuthShell>
  );
}
