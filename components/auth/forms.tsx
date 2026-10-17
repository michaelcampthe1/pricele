"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import {
  forgotPasswordAction,
  signInAction,
  signInWithGoogleAction,
  signUpAction,
  updatePasswordAction,
  type FormState,
} from "@/lib/auth/actions";

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Please wait…" : children}
    </Button>
  );
}

function FormMessage({ state }: { state: FormState }) {
  if (!state.message) return null;
  return (
    <Alert tone={state.ok ? "success" : "error"} role={state.ok ? "status" : "alert"}>
      {state.message}
    </Alert>
  );
}

export function GoogleButton({ next }: { next: string }) {
  return (
    <form action={signInWithGoogleAction}>
      <input type="hidden" name="next" value={next} />
      <Button type="submit" variant="secondary" size="lg" className="w-full">
        <svg aria-hidden viewBox="0 0 24 24" className="size-4">
          <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1S8.7 5.9 12 5.9c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z" />
        </svg>
        Continue with Google
      </Button>
    </form>
  );
}

export function Divider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wide text-muted">
      <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export function SignInForm({ next }: { next: string }) {
  const [state, action] = useActionState(signInAction, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <FormMessage state={state} />
      <Field id="email" label="Email" error={state.fieldErrors?.email}>
        <TextInput id="email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} error={state.fieldErrors?.email} />
      </Field>
      <Field id="password" label="Password" error={state.fieldErrors?.password}>
        <TextInput id="password" name="password" type="password" autoComplete="current-password" required error={state.fieldErrors?.password} />
      </Field>
      <div className="text-right text-sm">
        <Link href="/forgot-password" className="text-accent-strong hover:underline">Forgot password?</Link>
      </div>
      <Submit>Sign in</Submit>
    </form>
  );
}

export function SignUpForm({ next }: { next: string }) {
  const [state, action] = useActionState(signUpAction, {});
  if (state.ok) return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <FormMessage state={state} />
      <Field id="email" label="Email" error={state.fieldErrors?.email}>
        <TextInput id="email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} error={state.fieldErrors?.email} />
      </Field>
      <Field id="username" label="Username" hint="3–20 characters: lowercase letters, numbers, underscores. Shown on leaderboards." error={state.fieldErrors?.username}>
        <TextInput id="username" name="username" autoComplete="username" autoCapitalize="none" required minLength={3} maxLength={20} pattern="[a-z0-9_]{3,20}" defaultValue={state.values?.username} error={state.fieldErrors?.username} hint />
      </Field>
      <Field id="password" label="Password" hint="At least 8 characters, including a letter and a number." error={state.fieldErrors?.password}>
        <TextInput id="password" name="password" type="password" autoComplete="new-password" required minLength={8} error={state.fieldErrors?.password} hint />
      </Field>
      <Submit>Create account</Submit>
      <p className="text-xs text-muted">
        By creating an account you agree to the <Link href="/terms" className="underline">Terms</Link> and acknowledge the{" "}
        <Link href="/privacy" className="underline">Privacy policy</Link>.
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(forgotPasswordAction, {});
  if (state.ok) return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <Field id="email" label="Email" error={state.fieldErrors?.email}>
        <TextInput id="email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} error={state.fieldErrors?.email} />
      </Field>
      <Submit>Send reset link</Submit>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState(updatePasswordAction, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <Field id="password" label="New password" hint="At least 8 characters, including a letter and a number." error={state.fieldErrors?.password}>
        <TextInput id="password" name="password" type="password" autoComplete="new-password" required error={state.fieldErrors?.password} hint />
      </Field>
      <Field id="confirm" label="Confirm new password" error={state.fieldErrors?.confirm}>
        <TextInput id="confirm" name="confirm" type="password" autoComplete="new-password" required error={state.fieldErrors?.confirm} />
      </Field>
      <Submit>Update password</Submit>
    </form>
  );
}
