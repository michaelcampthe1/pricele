import Decimal from "decimal.js";

/**
 * Pricele scoring formula — reference implementation.
 *
 *   S = round(1000 / (1 + |ln(G / A)|))
 *
 * The AUTHORITATIVE implementation is the database function public.pricele_score, which runs
 * inside the atomic submission transaction so the answer key never leaves the database before
 * a guess is stored. This module mirrors it exactly (same exact-decimal arithmetic, same
 * half-away-from-zero rounding) and is parity-tested against it. It is used for unit tests,
 * documentation and admin previews — never to award points.
 */
export const SCORING_VERSION = "log-ratio-v1";
export const MAX_QUESTION_SCORE = 1000;
export const QUESTIONS_PER_DAY = 3;
export const MAX_DAILY_SCORE = MAX_QUESTION_SCORE * QUESTIONS_PER_DAY;
const MAX_AMOUNT = new Decimal("1000000000000000");

const D = Decimal.clone({ precision: 50, rounding: Decimal.ROUND_HALF_UP });

function toPositiveDecimal(value: string | number, name: string) {
  let d: Decimal;
  try {
    d = new D(value);
  } catch {
    throw new RangeError(`${name} must be a positive finite number`);
  }
  if (!d.isFinite() || d.isNaN() || d.lessThanOrEqualTo(0) || d.greaterThan(MAX_AMOUNT)) {
    throw new RangeError(`${name} must be a positive finite number no greater than 1e15`);
  }
  return d;
}

export function scoreGuess(guess: string | number, answer: string | number): number {
  const g = toPositiveDecimal(guess, "guess");
  const a = toPositiveDecimal(answer, "answer");
  const distance = D.ln(g).minus(D.ln(a)).abs();
  const raw = new D(MAX_QUESTION_SCORE).dividedBy(distance.plus(1));
  return raw.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

/** |G − A| / A × 100, rounded to 6 decimals (matches public.pricele_percentage_error). */
export function absolutePercentageError(guess: string | number, answer: string | number): string {
  const g = toPositiveDecimal(guess, "guess");
  const a = toPositiveDecimal(answer, "answer");
  return g.minus(a).abs().dividedBy(a).times(100).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toFixed(6);
}

/** Position of `value` relative to `answer` on a log scale clamped to [answer/10, answer×10], as 0..1. */
export function logScalePosition(value: string, answer: string): number {
  const ratio = D.log10(new D(value).dividedBy(new D(answer))).toNumber();
  return Math.min(1, Math.max(0, (ratio + 1) / 2));
}
