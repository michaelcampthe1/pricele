"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { AdminFormState } from "@/app/admin/actions";
import { Alert, Spinner } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";

type Action = (prev: AdminFormState, fd: FormData) => Promise<AdminFormState>;

function Submit({ label, variant }: { label: string; variant: "primary" | "secondary" | "danger" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending && <Spinner />} {label}
    </Button>
  );
}

/** Admin form with consistent success, error and validation-problem display. */
export function ActionForm({
  action,
  submitLabel,
  hidden = {},
  children,
  variant = "primary",
  className = "space-y-4",
  render,
}: {
  action: Action;
  submitLabel: string;
  hidden?: Record<string, string>;
  children?: ReactNode;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
  render?: (state: AdminFormState) => ReactNode;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className={className} noValidate>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {state.ok && state.message && (
        <Alert tone="success" role="status">
          {state.message}
        </Alert>
      )}
      {state.error && (
        <Alert tone="error" title={state.error}>
          {state.problems && state.problems.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-4">
              {state.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}
      {render ? render(state) : children}
      <div>
        <Submit label={submitLabel} variant={variant} />
      </div>
    </form>
  );
}
