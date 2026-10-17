"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  requestPasswordResetAction,
  signInAction,
  signInWithGoogleAction,
  signUpAction,
  updatePasswordAction,
  type AuthFormState,
} from "@/lib/auth/actions";
import { Field, TextInput } from "@/components/ui/form";
import { Alert, Spinner } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { USERNAME_RULE } from "@/lib/validation";

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending && <Spinner />}
      {children}
    </Button>
  );
}

function FormMessages({ state }: { state: AuthFormState }) {
  return (
    <>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.message && (
        <Alert tone="success" role="status">
          {state.message}
        </Alert>
      )}
    </>
  );
}

export function GoogleButton({ next }: { next: string }) {
  return (
    <form action={signInWithGoogleAction}>
      <input type="hidden" name="next" value={next} />
      <GoogleSubmit />
    </form>
  );
}

function GoogleSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="lg" className="w-full" disabled={pending}>
      <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4">
        <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8Z" />
        <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
        <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1Z" />
        <path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" />
      </svg>
      {pending ? "Redirecting…" : "Continue with Google"}
    </Button>
  );
}

export function SignInForm({ next }: { next: string }) {
  const [state, action] = useActionState(signInAction, {});
  return (
    <form action={action} noValidate className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <FormMessages state={state} />
      <Field id="email" label="Email" error={state.fieldErrors?.email}>
        <TextInput id="email" type="email" autoComplete="email" required defaultValue={state.values?.email} error={state.fieldErrors?.email} />
      </Field>
      <Field id="password" label="Password" error={state.fieldErrors?.password}>
        <TextInput id="password" type="password" autoComplete="current-password" required error={state.fieldErrors?.password} />
      </Field>
      <div className="text-right text-sm">
        <Link href="/forgot-password" className="font-medium text-green-strong underline underline-offset-2">
          Forgot password?
        </Link>
      </div>
      <Submit>Sign in</Submit>
    </form>
  );
}

export function SignUpForm({ next }: { next: string }) {
  const [state, action] = useActionState(signUpAction, {});
  if (state.message) return <FormMessages state={state} />;
  return (
    <form action={action} noValidate className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <FormMessages state={state} />
      <Field id="email" label="Email" error={state.fieldErrors?.email}>
        <TextInput id="email" type="email" autoComplete="email" required defaultValue={state.values?.email} error={state.fieldErrors?.email} />
      </Field>
      <Field id="username" label="Username" hint={USERNAME_RULE} error={state.fieldErrors?.username}>
        <TextInput
          id="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={20}
          defaultValue={state.values?.username}
          error={state.fieldErrors?.username}
          hint
        />
      </Field>
      <Field id="password" label="Password" hint="At least 8 characters, with a letter and a number." error={state.fieldErrors?.password}>
        <TextInput id="password" type="password" autoComplete="new-password" required error={state.fieldErrors?.password} hint />
      </Field>
      <Submit>Create account</Submit>
      <p className="text-center text-xs text-muted">
        By creating an account you agree to the <Link href="/terms" className="underline">Terms</Link> and{" "}
        <Link href="/privacy" className="underline">Privacy policy</Link>.
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordResetAction, {});
  if (state.message) return <FormMessages state={state} />;
  return (
    <form action={action} noValidate className="space-y-4">
      <FormMessages state={state} />
      <Field id="email" label="Email" error={state.fieldErrors?.email}>
        <TextInput id="email" type="email" autoComplete="email" required error={state.fieldErrors?.email} />
      </Field>
      <Submit>Send reset link</Submit>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState(updatePasswordAction, {});
  return (
    <form action={action} noValidate className="space-y-4">
      <FormMessages state={state} />
      <Field id="password" label="New password" hint="At least 8 characters, with a letter and a number." error={state.fieldErrors?.password}>
        <TextInput id="password" type="password" autoComplete="new-password" required error={state.fieldErrors?.password} hint />
      </Field>
      <Field id="confirm" label="Confirm new password" error={state.fieldErrors?.confirm}>
        <TextInput id="confirm" type="password" autoComplete="new-password" required error={state.fieldErrors?.confirm} />
      </Field>
      <Submit>Update password</Submit>
    </form>
  );
}
