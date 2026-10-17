import { describe, expect, it } from "vitest";
import { absolutePercentageError, logScalePosition, MAX_DAILY_SCORE, scoreGuess } from "@/lib/scoring";

describe("scoreGuess", () => {
  it("awards 1,000 for an exact guess", () => {
    expect(scoreGuess("25000", "25000")).toBe(1000);
    expect(scoreGuess("0.01", "0.01")).toBe(1000);
  });
  it("is symmetric for over- and under-estimates by the same factor", () => {
    expect(scoreGuess("200", "100")).toBe(591);
    expect(scoreGuess("50", "100")).toBe(591);
    expect(scoreGuess("1000", "100")).toBe(303);
    expect(scoreGuess("10", "100")).toBe(303);
  });
  it("handles very small and very large valid values", () => {
    expect(scoreGuess("0.01", "1000000000000000")).toBe(25);
    expect(scoreGuess("1000000000000000", "999999999999999.99")).toBe(1000);
    expect(scoreGuess("1000000000000000", "0.01")).toBe(25);
  });
  it("stays an integer between 0 and 1,000", () => {
    for (const [g, a] of [["1", "3"], ["123.45", "678.9"], ["9999", "1"], ["1", "9999"]]) {
      const s = scoreGuess(g, a);
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1000);
    }
  });
  it("handles decimal precision without float drift", () => {
    // 0.1 + 0.2 style inputs: the ratio is exactly 1.
    expect(scoreGuess("0.30", "0.3")).toBe(1000);
    // Near the 999.5 rounding boundary: |ln(r)| ≈ 0.0005 → just perfect / just not.
    expect(scoreGuess("100.04", "100")).toBe(1000);
    expect(scoreGuess("100.06", "100")).toBe(999);
  });
  it("rejects zero, negative, NaN, infinite and out-of-range values", () => {
    for (const bad of ["0", "-1", "NaN", "Infinity", "-Infinity", "abc", "1000000000000000.01"]) {
      expect(() => scoreGuess(bad, "100"), bad).toThrow(RangeError);
      expect(() => scoreGuess("100", bad), bad).toThrow(RangeError);
    }
    expect(() => scoreGuess(Number.NaN, 1)).toThrow(RangeError);
    expect(() => scoreGuess(Number.POSITIVE_INFINITY, 1)).toThrow(RangeError);
  });
  it("defines a 3,000-point daily maximum", () => {
    expect(MAX_DAILY_SCORE).toBe(3000);
  });
});

describe("absolutePercentageError", () => {
  it("computes |G − A| / A × 100 with fixed precision", () => {
    expect(absolutePercentageError("30000", "25000")).toBe("20.000000");
    expect(absolutePercentageError("20000", "25000")).toBe("20.000000");
    expect(absolutePercentageError("1", "3")).toBe("66.666667");
    expect(absolutePercentageError("100", "100")).toBe("0.000000");
  });
});

describe("logScalePosition", () => {
  it("centers the answer and clamps at ÷10 / ×10", () => {
    expect(logScalePosition("100", "100")).toBeCloseTo(0.5);
    expect(logScalePosition("10", "100")).toBeCloseTo(0);
    expect(logScalePosition("1000", "100")).toBeCloseTo(1);
    expect(logScalePosition("1", "100")).toBe(0);
    expect(logScalePosition("1000000", "100")).toBe(1);
  });
});
