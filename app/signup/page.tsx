import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { Divider, GoogleButton, SignUpForm } from "@/components/auth/forms";
import { getAuthUser } from "@/lib/auth/session";
import { publicEnv } from "@/lib/env";
import { safeNextPath } from "@/lib/security/redirect";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

export default async function SignupPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next, "/");
  if (await getAuthUser()) redirect(next);
  return (
    <AuthShell
      title="Create your account"
      subtitle="Free forever. Your guest progress on this device can be saved after you sign up."
      footer={
        <>
          Already have an account? <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-medium text-accent-strong hover:underline">Sign in</Link>
        </>
      }
    >
      {publicEnv().googleAuthEnabled ? (
        <>
          <GoogleButton next={next} />
          <Divider />
        </>
      ) : null}
      <SignUpForm next={next} />
    </AuthShell>
  );
}
