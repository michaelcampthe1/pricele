"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import type { FormState } from "@/lib/auth/actions";

function Submit({ label, variant }: { label: string; variant: "primary" | "secondary" | "danger" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} size="sm">
      {pending ? "Working…" : label}
    </Button>
  );
}

/** Generic admin form: runs a server action and shows its result and field errors. */
export function AdminForm({
  action,
  children,
  submitLabel,
  variant = "primary",
  className,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  children?: ReactNode;
  submitLabel: string;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const errors = Object.values(state.fieldErrors ?? {});
  return (
    <form action={formAction} className={className ?? "space-y-3"} noValidate>
      {state.message ? <Alert tone={state.ok ? "success" : "error"} role="status">{state.message}</Alert> : null}
      {errors.length ? (
        <Alert tone="error">
          <ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </Alert>
      ) : null}
      {children}
      <Submit label={submitLabel} variant={variant} />
    </form>
  );
}
