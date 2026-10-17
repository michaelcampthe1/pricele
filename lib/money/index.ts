import Decimal from "decimal.js";

/**
 * Money handling. Amounts travel as decimal strings ("1234.50") end to end so that no
 * binary floating-point value is ever authoritative. decimal.js is used for parsing and
 * display arithmetic; the database (numeric) is the source of truth.
 */
export const MIN_AMOUNT = new Decimal("0.01");
/** Upper bound for guesses and answers: one quadrillion dollars. */
export const MAX_AMOUNT = new Decimal("1000000000000000");

const SUFFIXES: Record<string, number> = { k: 3, m: 6, b: 9, bn: 9, t: 12, tn: 12 };

export type ParseResult =
  | { ok: true; value: string }
  | { ok: false; error: "empty" | "invalid" | "too_small" | "too_large" };

/**
 * Parses what a player types into a USD amount with at most two decimals.
 * Accepts "25000", "$25,000.50", "2.5m", "3 billion", "1.2k". Rejects zero, negatives,
 * scientific notation, NaN/Infinity and anything outside [0.01, 1e15].
 */
export function parseUsdInput(raw: string): ParseResult {
  if (typeof raw !== "string") return { ok: false, error: "invalid" };
  let s = raw.trim().toLowerCase();
  if (s === "") return { ok: false, error: "empty" };
  if (s.length > 40) return { ok: false, error: "invalid" };

  s = s.replace(/^usd\s*/, "").replace(/^\$\s*/, "").replace(/\s*usd$/, "");
  s = s
    .replace(/\s*(thousand)$/, "k")
    .replace(/\s*(million|mil|mm)$/, "m")
    .replace(/\s*(billion)$/, "b")
    .replace(/\s*(trillion)$/, "t");

  const match = /^([0-9][0-9,]*(?:\.[0-9]+)?|\.[0-9]+)\s*(k|m|bn|b|tn|t)?$/.exec(s);
  if (!match) return { ok: false, error: "invalid" };

  const digits = match[1];
  // Commas must be thousands separators if present at all.
  if (digits.includes(",") && !/^[0-9]{1,3}(,[0-9]{3})*(\.[0-9]+)?$/.test(digits)) {
    return { ok: false, error: "invalid" };
  }

  let value: Decimal;
  try {
    value = new Decimal(digits.replace(/,/g, ""));
  } catch {
    return { ok: false, error: "invalid" };
  }
  if (!value.isFinite()) return { ok: false, error: "invalid" };
  const suffix = match[2];
  if (suffix) value = value.times(new Decimal(10).pow(SUFFIXES[suffix]));
  value = value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  if (value.lessThan(MIN_AMOUNT)) return { ok: false, error: "too_small" };
  if (value.greaterThan(MAX_AMOUNT)) return { ok: false, error: "too_large" };
  return { ok: true, value: value.toFixed(2) };
}

export const PARSE_ERROR_MESSAGES: Record<Exclude<ParseResult, { ok: true }>["error"], string> = {
  empty: "Enter a dollar amount.",
  invalid: "Enter a number like 25000, 25,000.50 or 2.5m.",
  too_small: "Guesses must be at least $0.01.",
  too_large: "Guesses can't exceed $1 quadrillion.",
};

/** "$1,234,567.50" — cents are shown only when the amount has them. */
export function formatUsd(amount: string | number, opts: { compact?: boolean } = {}): string {
  const d = new Decimal(amount);
  if (opts.compact && d.greaterThanOrEqualTo(1_000_000)) return formatUsdCompact(d);
  const hasCents = !d.mod(1).isZero();
  const fmt = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  });
  // Intl accepts decimal strings without converting through a float.
  return fmt.format(d.toFixed(2) as unknown as number);
}

const COMPACT_UNITS: [number, string][] = [
  [12, " trillion"],
  [9, " billion"],
  [6, " million"],
];

/** "$2.5 billion" style, used only as a readability hint next to the exact figure. */
export function formatUsdCompact(amount: string | number | Decimal): string {
  const d = new Decimal(amount);
  for (const [exp, label] of COMPACT_UNITS) {
    const unit = new Decimal(10).pow(exp);
    if (d.greaterThanOrEqualTo(unit)) {
      const scaled = d.dividedBy(unit).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      return `$${scaled.toString()}${label}`;
    }
  }
  return formatUsd(d.toFixed(2));
}

export function absoluteDifference(a: string, b: string): string {
  return new Decimal(a).minus(new Decimal(b)).abs().toFixed(2);
}

/** Presentation of a stored percentage error. Storage keeps full precision. */
export function formatPercent(value: string | number): string {
  const d = new Decimal(value);
  if (d.greaterThanOrEqualTo(1000)) {
    return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
      d.toDecimalPlaces(0).toString() as unknown as number,
    )}%`;
  }
  if (d.greaterThanOrEqualTo(10)) return `${d.toDecimalPlaces(1, Decimal.ROUND_HALF_UP).toString()}%`;
  return `${d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString()}%`;
}

export function formatPoints(points: number): string {
  return new Intl.NumberFormat("en-US").format(points);
}
