"use client";

import { forwardRef, useCallback, useLayoutEffect, useRef } from "react";
import { amountInWords, formatTypedAmount, parseUsdInput, significantCharsBefore } from "@/lib/money";

/** USD guess input with a number keypad. Commas are added automatically as the player types. */
export const PriceInput = forwardRef<
  HTMLInputElement,
  {
    id: string;
    value: string;
    onChange: (v: string) => void;
    error: string | null;
    disabled?: boolean;
    label: string;
  }
>(function PriceInput({ id, value, onChange, error, disabled, label }, ref) {
  const parsed = value.trim() ? parseUsdInput(value) : null;
  const words = parsed?.ok ? amountInWords(parsed.value) : "";
  const hintId = `${id}-hint`;
  const inner = useRef<HTMLInputElement | null>(null);
  const caret = useRef<number | null>(null);
  const setRefs = useCallback(
    (el: HTMLInputElement | null) => {
      inner.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) ref.current = el;
    },
    [ref],
  );
  // After reformatting, put the caret back after the same number of digits it followed before.
  useLayoutEffect(() => {
    const el = inner.current;
    const want = caret.current;
    if (!el || want === null || document.activeElement !== el) return;
    caret.current = null;
    let pos = 0;
    let seen = 0;
    while (pos < value.length && seen < want) {
      if (/[0-9.]/.test(value[pos])) seen++;
      pos++;
    }
    el.setSelectionRange(pos, pos);
  }, [value]);
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-ink">
        {label}
      </label>
      <div
        className={`flex items-center rounded-[12px] border-2 bg-surface transition-colors focus-within:border-green ${
          error ? "border-red" : "border-line-strong hover:border-ink-soft"
        } ${disabled ? "opacity-70" : ""}`}
      >
        <span aria-hidden className="pl-4 font-display text-2xl font-semibold text-muted">
          $
        </span>
        <input
          ref={setRefs}
          id={id}
          name="guess"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          placeholder="0"
          maxLength={40}
          value={value}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hintId}
          onChange={(e) => {
            const raw = e.target.value;
            caret.current = significantCharsBefore(raw, e.target.selectionStart ?? raw.length);
            onChange(formatTypedAmount(raw));
          }}
          className="tnum min-w-0 flex-1 bg-transparent py-3.5 pl-1.5 pr-4 font-display text-2xl font-semibold text-ink outline-none placeholder:text-line-strong focus-visible:outline-none"
        />
        <span aria-hidden className="pr-4 text-sm font-medium text-muted">
          USD
        </span>
      </div>
      {error ? (
        <p id={errorId} className="mt-2 text-sm font-medium text-red">
          {error}
        </p>
      ) : (
        <p id={hintId} className="mt-2 min-h-5 text-sm text-muted">
          {words ? `≈ ${words} dollars` : "Type the full amount — commas are added for you."}
        </p>
      )}
    </div>
  );
});
