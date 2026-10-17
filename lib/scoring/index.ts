import Decimal from "decimal.js";

/**
 * Pricele scoring — TypeScript mirror of the authoritative SQL function `pricele.score`.
 *
 *   S = round(1000 / (1 + |ln(G) - ln(A)|))
 *
 * Official scores are ALWAYS computed inside PostgreSQL during submission. This module
 * exists for previews in the admin dashboard and for parity tests against the database.
 * It uses decimal.js (40 significant digits) rather than binary floating point.
 */

const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export const SCORING_VERSION = "log-v1";
export const MAX_SCORE = 1000;
export const MAX_DAILY_SCORE = 3000;
/** Smallest accepted amount: one cent. */
export const MIN_AMOUNT = "0.01";
/** Largest accepted amount: one quadrillion USD (covers any real-world price, incl. multi-trillion valuations). */
export const MAX_AMOUNT = "1000000000000000";

export class ScoringInputError extends Error {}

function toDecimal(value: Decimal.Value, label: string): Decimal {
  let d: Decimal;
  try {
    d = new D(value);
  } catch {
    throw new ScoringInputError(`${label} is not a number`);
  }
  if (!d.isFinite() || d.isNaN()) throw new ScoringInputError(`${label} must be finite`);
  if (d.lte(0)) throw new ScoringInputError(`${label} must be greater than zero`);
  if (d.gt(MAX_AMOUNT)) throw new ScoringInputError(`${label} exceeds the maximum amount`);
  return d;
}

export function computeScore(guess: Decimal.Value, answer: Decimal.Value): number {
  const g = toDecimal(guess, "Guess");
  const a = toDecimal(answer, "Answer");
  const distance = g.ln().minus(a.ln()).abs();
  const raw = new D(MAX_SCORE).div(distance.plus(1));
  return raw.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

/** |G - A| / A * 100, rounded to 6 decimal places (matches stored precision). */
export function percentageError(guess: Decimal.Value, answer: Decimal.Value): string {
  const g = toDecimal(guess, "Guess");
  const a = toDecimal(answer, "Answer");
  return g.minus(a).abs().times(100).div(a).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toFixed(6);
}

/** Human-readable error, e.g. "20%", "3.4%", "<0.1%", "1,250%". Presentation only. */
export function formatPercentageError(value: string | number): string {
  const d = new D(value);
  if (d.isZero()) return "0%";
  if (d.lt("0.1")) return "<0.1%";
  if (d.lt(10)) return `${d.toDecimalPlaces(1, Decimal.ROUND_HALF_UP).toString()}%`;
  return `${new Intl.NumberFormat("en-US").format(d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber())}%`;
}

/** Ratio of guess to answer, e.g. 2 means "2x too high", 0.5 means "half". */
export function guessRatio(guess: Decimal.Value, answer: Decimal.Value): number {
  return new D(guess).div(new D(answer)).toNumber();
}
