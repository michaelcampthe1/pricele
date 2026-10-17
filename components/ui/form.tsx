import type { ComponentProps, ReactNode } from "react";

export const inputClass =
  "block w-full rounded-[10px] border border-line-strong bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-muted/70 transition-colors hover:border-ink-soft focus:border-green focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-green aria-[invalid=true]:border-red disabled:bg-sunk";

export function Field({
  id,
  label,
  hint,
  error,
  children,
  optional,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  optional?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
        {optional && <span className="ml-1 font-normal text-muted">(optional)</span>}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm font-medium text-red">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextInput({ id, error, hint, ...props }: ComponentProps<"input"> & { id: string; error?: string | null; hint?: boolean }) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return <input id={id} name={props.name ?? id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={inputClass} {...props} />;
}

export function TextArea({ id, error, ...props }: ComponentProps<"textarea"> & { id: string; error?: string | null }) {
  return (
    <textarea
      id={id}
      name={props.name ?? id}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      className={`${inputClass} min-h-24`}
      {...props}
    />
  );
}

export function Select({ id, children, ...props }: ComponentProps<"select"> & { id: string }) {
  return (
    <select id={id} name={props.name ?? id} className={`${inputClass} pr-8`} {...props}>
      {children}
    </select>
  );
}
