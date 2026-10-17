import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/auth-forms";
import { getSessionUser } from "@/lib/auth/session";
import { Alert } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function ResetPasswordPage() {
  const user = await getSessionUser();
  return (
    <AuthShell title="Choose a new password">
      {user ? (
        <ResetPasswordForm />
      ) : (
        <Alert tone="warning" title="This reset link has expired">
          <Link href="/forgot-password">Request a new link</Link> to reset your password.
        </Alert>
      )}
    </AuthShell>
  );
}
