"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { deleteAccountAction, updateProfileAction, updateUsernameAction } from "@/app/profile/actions";
import { Field, TextInput } from "@/components/ui/form";
import { Alert, Spinner } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { USERNAME_RULE } from "@/lib/validation";

function Save({ label = "Save changes", variant = "primary" as "primary" | "danger" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending && <Spinner />} {label}
    </Button>
  );
}

export function ProfileForm({ displayName, avatarUrl, isPublic }: { displayName: string | null; avatarUrl: string | null; isPublic: boolean }) {
  const [state, action] = useActionState(updateProfileAction, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.ok && <Alert tone="success" role="status">Saved.</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <Field id="displayName" label="Display name" optional error={state.fieldErrors?.displayName}>
        <TextInput id="displayName" maxLength={40} defaultValue={displayName ?? ""} error={state.fieldErrors?.displayName} />
      </Field>
      <Field id="avatarUrl" label="Avatar image URL" optional hint="An https:// link to a square image." error={state.fieldErrors?.avatarUrl}>
        <TextInput id="avatarUrl" type="url" inputMode="url" defaultValue={avatarUrl ?? ""} error={state.fieldErrors?.avatarUrl} hint />
      </Field>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="isPublic" defaultChecked={isPublic} className="mt-0.5 h-4 w-4 accent-[var(--green)]" />
        <span>
          <span className="font-medium text-ink">Public profile</span>
          <span className="block text-muted">
            Show your username, stats and shared results to others. When off, leaderboards list you as &quot;Private player&quot;.
          </span>
        </span>
      </label>
      <Save />
    </form>
  );
}

export function UsernameForm({ username }: { username: string }) {
  const [state, action] = useActionState(updateUsernameAction, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.ok && <Alert tone="success" role="status">Username updated.</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <Field id="username" label="Username" hint={USERNAME_RULE} error={state.fieldErrors?.username}>
        <TextInput id="username" autoCapitalize="none" spellCheck={false} maxLength={20} defaultValue={username} error={state.fieldErrors?.username} hint />
      </Field>
      <Save label="Change username" />
    </form>
  );
}

export function DeleteAccountForm() {
  const [state, action] = useActionState(deleteAccountAction, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <p className="text-sm text-ink-soft">
        This permanently deletes your account, profile, guesses, scores and streaks. Leaderboards update immediately. This can&apos;t be undone.
      </p>
      <Field id="confirm" label='Type "delete my account" to confirm' error={state.fieldErrors?.confirm}>
        <TextInput id="confirm" autoComplete="off" error={state.fieldErrors?.confirm} />
      </Field>
      <Save label="Delete account" variant="danger" />
    </form>
  );
}
