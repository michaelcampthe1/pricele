"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { formatUsd, formatUsdCompact, parseUsdInput, PARSE_ERROR_MESSAGES } from "@/lib/money";

/**
 * USD guess input. Validates on the client for usability; the server re-validates everything.
 * Supports shorthand (2.5m, 3b, 40k) because many Pricele answers are very large.
 */
export function GuessForm({
  onSubmit,
  submitLabel = "Lock in guess",
  label = "Your guess",
  autoFocus = false,
  disabled = false,
  hint = "One guess. It can't be changed after you submit.",
}: {
  hint?: string;
  onSubmit: (value: string) => Promise<string | null>;
  submitLabel?: string;
  label?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [pending, startTransition] = useTransition();

  const parsed = raw.trim() ? parseUsdInput(raw) : null;
  const preview = parsed?.ok
    ? Number(parsed.value) >= 1_000_000
      ? `${formatUsd(parsed.value)} · ${formatUsdCompact(parsed.value)}`
      : formatUsd(parsed.value)
    : null;
  const liveError = touched && parsed && !parsed.ok ? PARSE_ERROR_MESSAGES[parsed.error] : null;
  const shownError = error ?? liveError;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setTouched(true);
    const result = parseUsdInput(raw);
    if (!result.ok) {
      setError(PARSE_ERROR_MESSAGES[result.error]);
      return;
    }
    setError(null);
    startTransition(async () => {
      const failure = await onSubmit(raw);
      if (failure) setError(failure);
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-3">
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label} <span className="font-normal text-muted">(USD)</span>
      </label>
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <div className="relative flex-1">
          <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl font-semibold text-muted">
            $
          </span>
          <input
            id={id}
            name="guess"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            maxLength={40}
            autoFocus={autoFocus}
            disabled={disabled || pending}
            value={raw}
            placeholder="25,000 or 2.5m"
            onChange={(e) => {
              setRaw(e.target.value);
              setError(null);
            }}
            onBlur={() => raw && setTouched(true)}
            aria-invalid={shownError ? true : undefined}
            aria-describedby={`${id}-help`}
            className={cn(
              "tabular block h-14 w-full rounded-[var(--radius)] border border-border-strong bg-surface pl-9 pr-4 text-xl font-semibold text-ink placeholder:font-normal placeholder:text-muted/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25",
              shownError && "border-error focus:border-error focus:ring-error/20",
            )}
          />
        </div>
        <Button type="submit" size="lg" disabled={disabled || pending} className="h-14 sm:w-auto">
          {pending ? <Spinner label="Submitting your guess" /> : null}
          {pending ? "Submitting…" : submitLabel}
          {!pending ? <ArrowRight aria-hidden className="size-4" /> : null}
        </Button>
      </div>
      <p id={`${id}-help`} aria-live="polite" className={cn("min-h-5 text-sm", shownError ? "text-error" : "text-muted")}>
        {shownError ?? (preview ? <span className="tabular">{preview}</span> : hint)}
      </p>
    </form>
  );
}
