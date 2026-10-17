"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { deleteAccountAction, updateProfileAction } from "@/lib/auth/profile-actions";

function Submit({ children, variant = "primary" }: { children: React.ReactNode; variant?: "primary" | "danger" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? "Saving…" : children}
    </Button>
  );
}

export function ProfileForm({ initial }: { initial: { username: string; displayName: string; avatarUrl: string; isPublic: boolean } }) {
  const [state, action] = useActionState(updateProfileAction, {});
  const v = state.values ?? initial;
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.message ? <Alert tone={state.ok ? "success" : "error"} role="status">{state.message}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="username" label="Username" hint="Lowercase letters, numbers and underscores." error={state.fieldErrors?.username}>
          <TextInput id="username" name="username" defaultValue={v.username} autoCapitalize="none" required error={state.fieldErrors?.username} hint />
        </Field>
        <Field id="displayName" label="Display name" hint="Optional, up to 40 characters." error={state.fieldErrors?.displayName}>
          <TextInput id="displayName" name="displayName" defaultValue={v.displayName} maxLength={40} error={state.fieldErrors?.displayName} hint />
        </Field>
      </div>
      <Field id="avatarUrl" label="Avatar image URL" hint="Optional. A full https:// link to a square image." error={state.fieldErrors?.avatarUrl}>
        <TextInput id="avatarUrl" name="avatarUrl" type="url" defaultValue={v.avatarUrl} placeholder="https://" error={state.fieldErrors?.avatarUrl} hint />
      </Field>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="isPublic" defaultChecked={initial.isPublic} className="mt-0.5 size-4 accent-[var(--accent)]" />
        <span>
          <span className="font-medium text-ink">Public profile</span>
          <span className="block text-muted">Others can view your profile page and shared results. Your username always appears on leaderboards.</span>
        </span>
      </label>
      <Submit>Save profile</Submit>
    </form>
  );
}

export function DeleteAccountForm({ username }: { username: string }) {
  const [state, action] = useActionState(deleteAccountAction, {});
  return (
    <form action={action} className="space-y-3" noValidate>
      {state.message ? <Alert tone="error">{state.message}</Alert> : null}
      <Field id="confirm" label={<>Type <span className="font-mono">{username}</span> to confirm</>} error={state.fieldErrors?.confirm}>
        <TextInput id="confirm" name="confirm" autoComplete="off" autoCapitalize="none" error={state.fieldErrors?.confirm} />
      </Field>
      <Submit variant="danger">Delete my account permanently</Submit>
    </form>
  );
}
