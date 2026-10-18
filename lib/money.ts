import Decimal from "decimal.js";
import { MAX_AMOUNT, MIN_AMOUNT } from "@/lib/scoring";

const D = Decimal.clone({ precision: 40 });

const SUFFIX: Record<string, string> = {
  k: "1e3",
  thousand: "1e3",
  m: "1e6",
  mm: "1e6",
  million: "1e6",
  b: "1e9",
  bn: "1e9",
  billion: "1e9",
  t: "1e12",
  trillion: "1e12",
};

export type ParsedAmount =
  | { ok: true; value: string }
  | { ok: false; error: string };

/**
 * Parses a user-entered USD amount into a normalized decimal string with 2 decimals.
 * Accepts "$1,234.50", "1234", "2.5k", "3 million", "1.2B". Rejects zero, negatives,
 * non-finite values, more than two decimal places (without a suffix) and amounts
 * outside [$0.01, $1,000,000,000,000,000].
 */
export function parseUsdInput(raw: unknown): ParsedAmount {
  if (typeof raw !== "string" && typeof raw !== "number") {
    return { ok: false, error: "Enter a dollar amount." };
  }
  let s = String(raw).trim().toLowerCase();
  if (s === "") return { ok: false, error: "Enter a dollar amount." };
  if (s.length > 40) return { ok: false, error: "That amount is too long." };

  s = s.replace(/^usd\s*/, "").replace(/\s*usd$/, "").replace(/^\$\s*/, "");
  if (s.startsWith("-")) return { ok: false, error: "Guesses must be greater than $0." };

  const match = /^([0-9][0-9,]*(?:\.[0-9]*)?|\.[0-9]+)\s*([a-z]*)$/.exec(s);
  if (!match) return { ok: false, error: "Use numbers only, like 1,250 or 2.5 million." };

  const [, numberPart, suffixPart] = match;
  if (numberPart.includes(",") && !/^[0-9]{1,3}(,[0-9]{3})*(\.[0-9]*)?$/.test(numberPart)) {
    return { ok: false, error: "Check the comma placement." };
  }
  const digits = numberPart.replace(/,/g, "");
  let multiplier = "1";
  if (suffixPart) {
    const m = SUFFIX[suffixPart];
    if (!m) return { ok: false, error: "Use k, million, billion or trillion as shorthand." };
    multiplier = m;
  }

  let value: Decimal;
  try {
    value = new D(digits).times(multiplier);
  } catch {
    return { ok: false, error: "That isn't a valid number." };
  }
  if (!value.isFinite()) return { ok: false, error: "That isn't a valid number." };
  if (value.lte(0)) return { ok: false, error: "Guesses must be greater than $0." };
  if (!suffixPart && value.decimalPlaces() > 2) {
    return { ok: false, error: "Use at most two decimal places." };
  }
  value = value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (value.lt(MIN_AMOUNT)) return { ok: false, error: "The smallest guess is $0.01." };
  if (value.gt(MAX_AMOUNT)) return { ok: false, error: "The largest guess is $1 quadrillion." };
  return { ok: true, value: value.toFixed(2) };
}

/** Formats a decimal string as USD. Shows cents only when they are non-zero. */
export function formatUsd(value: string | number): string {
  const d = new D(value);
  const hasCents = !d.mod(1).isZero();
  // Intl accepts numeric strings exactly ("string decimal" formatting), avoiding float rounding.
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  }).format(d.toFixed(2) as unknown as number);
}

/** Compact USD for tight spaces: $1.2M, $35B, $950. */
export function formatUsdCompact(value: string | number): string {
  const d = new D(value);
  if (d.lt(10000)) return formatUsd(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(d.toNumber());
}

/** Absolute difference between two amounts, formatted. */
export function formatDifference(a: string, b: string): string {
  return formatUsd(new D(a).minus(b).abs().toFixed(2));
}

/** A spelled-out hint for large numbers, e.g. "2.5 billion". Empty for small values. */
export function amountInWords(value: string): string {
  const d = new D(value);
  const units: [string, string][] = [
    ["1e12", "trillion"],
    ["1e9", "billion"],
    ["1e6", "million"],
  ];
  for (const [size, word] of units) {
    if (d.gte(size)) {
      const n = d.div(size);
      const shown = n.gte(100) ? n.toDecimalPlaces(0) : n.toDecimalPlaces(2);
      return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(shown.toNumber())} ${word}`;
    }
  }
  return "";
}

/**
 * Live-formats what a player types into the guess box: keeps digits and one decimal point
 * (max two decimals), drops leading zeros and inserts thousands separators.
 * "1234567.891" → "1,234,567.89", "0005" → "5", "." → "0.".
 */
export function formatTypedAmount(raw: string): string {
  let s = raw.replace(/[^0-9.]/g, "");
  const dot = s.indexOf(".");
  let int = dot === -1 ? s : s.slice(0, dot);
  const frac = dot === -1 ? null : s.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  int = int.replace(/^0+(?=\d)/, "");
  if (int === "" && frac !== null) int = "0";
  s = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac === null ? s : `${s}.${frac}`;
}

/** Number of digits (and decimal points) before position `pos` in `s`, used to keep the caret steady. */
export function significantCharsBefore(s: string, pos: number): number {
  return s.slice(0, pos).replace(/[^0-9.]/g, "").length;
}
