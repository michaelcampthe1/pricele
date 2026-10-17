import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export const inputClasses =
  "block w-full rounded-[var(--radius)] border border-border-strong bg-surface px-3.5 h-11 text-base text-ink placeholder:text-muted/70 transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 aria-[invalid=true]:border-error aria-[invalid=true]:focus:ring-error/20 disabled:bg-surface-muted";

export function Field({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-error">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Text input wired to a Field's id, hint and error for screen readers. */
export function TextInput({
  id,
  error,
  hint,
  className,
  ...props
}: ComponentProps<"input"> & { id: string; error?: string; hint?: boolean }) {
  return (
    <input
      id={id}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
      className={cn(inputClasses, className)}
      {...props}
    />
  );
}

export function TextArea({
  id,
  error,
  className,
  ...props
}: ComponentProps<"textarea"> & { id: string; error?: string }) {
  return (
    <textarea
      id={id}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      className={cn(inputClasses, "h-auto min-h-24 py-2.5 leading-relaxed", className)}
      {...props}
    />
  );
}

export function Select({ id, className, ...props }: ComponentProps<"select"> & { id: string }) {
  return <select id={id} className={cn(inputClasses, "pr-8", className)} {...props} />;
}
